import { Box } from '@mui/material';
import { useEffect, useMemo, useState, type FC } from 'react';

export type VisualizeCoverageProps = {
  blockSize: number;
  sampleCount: number;
  watchIntervalMs: number;
  fileHandle: FileSystemFileHandle;
};

export const VisualizeCoverage: FC<VisualizeCoverageProps> = ({
  blockSize,
  sampleCount,
  watchIntervalMs,
  fileHandle,
}) => {
  const [file, setFile] = useState<File>();

  const fileSize = useMemo(() => {
    if (!file) return null;
    return file.size;
  }, [file]);

  const gapSize = useMemo(() => {
    if (!fileSize) return null;
    const totalCovered = blockSize * sampleCount;
    const totalUncovered = Math.max(0, fileSize - totalCovered);
    const gapSize = totalUncovered / (sampleCount - 1);
    return Math.floor(gapSize);
  }, [blockSize, fileSize, sampleCount]);

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
      {Array.from({ length: sampleCount }, (_, i) => [
        <Box
          data-testid="VisualizeCoverage-block"
          key={`block-${i}`}
          sx={{
            flex: blockSize,
            backgroundColor: (theme) => theme.palette.primary.dark,
          }}
        />,
        i < sampleCount - 1 ?
          <Box
            data-testid="VisualizeCoverage-gap"
            key={`gap-${i}`}
            sx={{
              flex: gapSize,
            }}
          /> :
          null,
      ])}
    </Box>
  );
};
