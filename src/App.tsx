import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { SnackbarProvider, enqueueSnackbar } from 'notistack';
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FC } from 'react';
import { SampledFileComparator } from './sampled-file-comparator';
import { createStore, del, get, set } from 'idb-keyval';
import { VisualizeCoverage } from './VisualizeCoverage';

const customStore = createStore('/poll-file-for-changes', 'fileHandleStore');

export const App: FC = () => {
  const id = `App-${useId()}`;

  const [blockSize, setBlockSize] = useState(0x1000);
  const [sampleCount, setSampleCount] = useState(0x40);
  const [watchIntervalMs, setWatchIntervalMs] = useState(500);
  const [maxDeltaMs, setMaxDeltaMs] = useState(60_000);
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [comparator, setComparator] = useState<SampledFileComparator>();
  const [lastUpdate, setLastUpdate] = useState<number>();
  const waitForFirstChange = false;
  const lastModifiedRef = useRef<number>(null);

  const regions = useMemo(() => {
    return comparator ? comparator.getRegions() : [];
  }, [comparator]);

  useEffect(() => {
    if (!fileHandle || !comparator) return;

    const clock = setInterval(async () => {
      const next = await fileHandle.getFile();
      if (next.lastModified !== lastModifiedRef.current) {
        enqueueSnackbar('Detected a change: last modified time updated');
        lastModifiedRef.current = next.lastModified;
        setLastUpdate(Date.now());
        return;
      }
      const before = performance.now();
      const isSame = await comparator.isSame(next);
      const after = performance.now();
      const delta = after - before;
      console.debug('Comparison executed in %i milliseconds', delta);
      if (!isSame) {
        enqueueSnackbar('Detected a change: file contents changed');
        await comparator.init(next);
        setLastUpdate(Date.now());
      }
    }, watchIntervalMs);

    return () => {
      clearInterval(clock);
    };
  }, [comparator, fileHandle, watchIntervalMs]);

  useEffect(() => {
    if (!lastUpdate) return;

    const clock = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - lastUpdate;
      if (deltaMs > maxDeltaMs) {
        setComparator(undefined);
        setLastUpdate(undefined);
        enqueueSnackbar('Stopped watching for changes', {
          variant: 'info',
        });
      }
    }, 1_000);

    return () => {
      clearInterval(clock);
    };
  }, [lastUpdate, maxDeltaMs]);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    }, { signal });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      if (!e.dataTransfer) return;
      for (const item of e.dataTransfer.items) {
        if (item.kind === 'file') {
          if (typeof item.getAsFileSystemHandle !== 'function') {
            break;
          }
          const handle = await item.getAsFileSystemHandle();
          if (handle.kind !== 'file') {
            break;
          }
          setFileHandle(handle);
          setComparator(undefined);
          const file = item.getAsFile();
          if (!file) {
            break;
          }
          lastModifiedRef.current = file.lastModified;
        }
      }
    }, { signal });

    return () => {
      controller.abort();
    };
  }, [setFileHandle]);

  useEffect(() => {
    if (!fileHandle) return;
    (async () => {
      await set('fileHandle', fileHandle, customStore);
    })();
  }, [fileHandle]);

  useEffect(() => {
    (async () => {
      const fileHandle = await get('fileHandle', customStore);
      setFileHandle(fileHandle);
    })();
  }, []);

  return (
    <Stack maxWidth="80ch" mx="auto" px={2} my={6} gap={4}>
      <SnackbarProvider />

      <Typography component="h1" variant="h5">
        Poll file for changes
      </Typography>

      <Stack gap={2}>
        <Stack direction={{ sm: 'column', md: 'row' }} gap={2}>
          <TextField
            id={`${id}-blockSize`}
            label="Block size"
            value={blockSize}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setBlockSize(event.target.valueAsNumber);
            }}
            type="number"
            slotProps={{
              htmlInput: {
                min: 0x400,
                max: 0x4000,
                step: 0x100,
              },
            }}
            fullWidth
          />

          <TextField
            id={`${id}-sampleCount`}
            label="Sample count"
            value={sampleCount}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setSampleCount(event.target.valueAsNumber);
            }}
            type="number"
            slotProps={{
              htmlInput: {
                min: 0x40,
                max: 0x400,
                step: 0x10,
              },
            }}
            fullWidth
          />

          <TextField
            id={`${id}-watchInterval`}
            label="Watch interval (ms)"
            value={watchIntervalMs}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setWatchIntervalMs(event.target.valueAsNumber);
            }}
            type="number"
            slotProps={{
              htmlInput: {
                min: 100,
                max: 60_000,
                step: 100,
              },
            }}
            fullWidth
          />

          <TextField
            id={`${id}-maxDelta`}
            label="Stop watching after (ms)"
            value={maxDeltaMs}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setMaxDeltaMs(event.target.valueAsNumber);
            }}
            type="number"
            slotProps={{
              htmlInput: {
                min: 1_000,
                max: 600_000,
                step: 1_000,
              },
            }}
            fullWidth
          />
        </Stack>

        <Stack direction="row" gap={2}>
          <Button
            variant={fileHandle ? 'outlined' : 'contained'}
            onClick={async () => {
              const [fileHandle] = await window.showOpenFilePicker({
                id: 'fileHandle',
                startIn: 'downloads',
                multiple: false,
              });
              setFileHandle(fileHandle);
              const file = await fileHandle.getFile();
              lastModifiedRef.current = file.lastModified;
            }}
            fullWidth
          >
            Select file
          </Button>

          {fileHandle && (
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => {
                setFileHandle(null);
                del('fileHandle', customStore);
                setComparator(undefined);
                setLastUpdate(undefined);
              }}
              fullWidth
            >
              Clear file
            </Button>
          )}
        </Stack>

        {fileHandle && (
          <Box>
            <Typography fontWeight="bold">
              {fileHandle.name}
            </Typography>
          </Box>
        )}

        {fileHandle && (
          <Stack direction="row" gap={2}>
            {!comparator && (
              <Button
                variant={comparator ? 'outlined' : 'contained'}
                onClick={async () => {
                  if (typeof fileHandle.requestPermission === 'function') {
                    const status = await fileHandle.requestPermission({ mode: 'read' });
                    if (status !== 'granted') {
                      enqueueSnackbar('Access denied', {
                        variant: 'error',
                      });
                      return;
                    }
                  }

                  const comparator = new SampledFileComparator({
                    blockSize,
                    sampleCount,
                  });

                  const first = await fileHandle.getFile();
                  lastModifiedRef.current = first.lastModified;
                  await comparator.init(first);

                  setComparator(comparator);
                  setLastUpdate(waitForFirstChange ? undefined : Date.now());
                }}
                fullWidth
              >
                Start watching
              </Button>
            )}

            {comparator && (
              <Button
                variant="outlined"
                onClick={() => {
                  setComparator(undefined);
                  setLastUpdate(undefined);
                }}
                fullWidth
              >
                Stop watching
              </Button>
            )}
          </Stack>
        )}
      </Stack>

      {fileHandle && comparator && (
        <Stack gap={1}>
          <Typography component="h2" variant="h6">
            Coverage visualizer
          </Typography>

          <VisualizeCoverage
            regions={regions}
            watchIntervalMs={watchIntervalMs}
            fileHandle={fileHandle}
          />
        </Stack>
      )}
    </Stack>
  );
};
