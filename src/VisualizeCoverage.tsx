import { Box } from '@mui/material';
import { useEffect, useMemo, useState, type FC } from 'react';
import type { Region } from './sampled-file-comparator';

export type VisualizeCoverageProps = {
  regions: Region[];
  watchIntervalMs: number;
  fileHandle: FileSystemFileHandle;
};

export const VisualizeCoverage: FC<VisualizeCoverageProps> = ({
  regions,
  watchIntervalMs,
  fileHandle,
}) => {
  const [file, setFile] = useState<File>();

  const fileSize = useMemo(() => {
    if (!file) return null;
    return file.size;
  }, [file]);

  useEffect(() => {
    fileHandle.getFile().then(setFile);

    const clock = setInterval(() => {
      fileHandle.getFile().then(setFile);
    }, watchIntervalMs);

    return () => {
      clearInterval(clock);
    };
  }, [fileHandle, watchIntervalMs]);

  if (!fileSize) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        height: (theme) => theme.spacing(2),
        backgroundColor: (theme) => theme.palette.action.disabledBackground,
        border: '1px solid',
        borderColor: (theme) => theme.palette.divider,
        borderRadius: (theme) => theme.spacing(0.5),
        contain: 'paint',
      }}
    >
      {regions.map((region, i) => [
        <Box
          key={`gap-${i}`}
          data-testid="VisualizeCoverage-offset"
          data-region-index={i}
          data-region-offset={region.offset}
          data-region-length={region.length}
          sx={{
            flex: region.offset - (
              i === 0 ? 0 :
              regions[i - 1].offset + regions[i - 1].length
            ),
          }}
        />,
        <Box
          key={`block-${i}`}
          data-testid="VisualizeCoverage-length"
          data-region-index={i}
          data-region-offset={region.offset}
          data-region-length={region.length}
          sx={{
            flex: region.length,
            backgroundColor: (theme) => theme.palette.primary.dark,
          }}
        />,
      ])}
      <Box
        data-testid="VisualizeCoverage-leftover"
        sx={{
          flex: (fileSize ?? 0) - (
            (regions.at(-1)?.offset ?? 0) +
            (regions.at(-1)?.length ?? 0)
          ),
        }}
      />
    </Box>
  );
};
