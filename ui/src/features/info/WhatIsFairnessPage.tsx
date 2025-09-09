import React from 'react';
import { Box, Container, Typography, Stack, Chip } from '@mui/material';
import { ArrowForwardIos } from '@mui/icons-material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';

function Block({ color }: { color: string }) {
  return (
    <Box
      sx={{
        width: 24,
        height: 24,
        borderRadius: 0.8,
        bgcolor: color,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)'
      }}
    />
  );
}

function DirectionLegend() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>Front of queue</Typography>
      <ArrowForwardIos fontSize="small" sx={{ color: 'text.secondary' }} />
      <Typography variant="body2" color="text.secondary">processed left → right</Typography>
      <Box sx={{ flex: 1 }} />
      <Typography variant="body2" color="text.secondary">Back of queue</Typography>
    </Box>
  );
}

function ExampleBox({ children, good }: { children: React.ReactNode; good?: boolean }) {
  return (
    <Box
      sx={{
        position: 'relative',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        p: 2,
        mb: 2,
        bgcolor: 'background.paper',
        '&:before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          borderTopLeftRadius: 8,
          borderBottomLeftRadius: 8,
          backgroundColor: good ? 'success.main' : 'error.main',
        },
      }}
    >
      {children}
    </Box>
  );
}

function Row({ colors, label, note, result, good }: { colors: string[]; label: string; note?: string; result?: string; good?: boolean }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6" sx={{ mb: 1, fontSize: 18, fontWeight: 600 }}>{label}</Typography>
      <DirectionLegend />
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1, bgcolor: 'background.paper', overflowX: 'auto' }}>
        <Stack direction="row" spacing={0.7} sx={{ flexWrap: 'nowrap', alignItems: 'center' }}>
          {colors.map((c, i) => (
            <Block key={`${c}-${i}`} color={c} />
          ))}
        </Stack>
      </Box>
      {note && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
          {note}
        </Typography>
      )}
      {result && (
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center' }}>
          {good ? (
            <CheckCircleOutlineIcon fontSize="small" color="success" />
          ) : (
            <HighlightOffIcon fontSize="small" color="error" />
          )}
          <Typography variant="body2" color={good ? 'success.main' : 'error.main'}>{result}</Typography>
        </Stack>
      )}
    </Box>
  );
}

export default function WhatIsFairnessPage() {
  // Visual suggestion: show contrast between crowding-out vs balanced dispatch
  const blue = '#4F83CC'; // Tenant A
  const green = '#66BB6A'; // Tenant B
  const orange = '#FFA726'; // Tenant C
  const purple = '#AB47BC'; // Tenant D

  // Without fairness: emphasize crowding-out (mostly blue near the front)
  const withoutFairness = [
    blue, blue, blue, blue, blue, blue, blue, blue, blue, blue,
    blue, blue, blue, blue, blue, blue, blue, blue, blue, blue,
    blue, blue, blue,
    green, blue, orange, blue, blue, purple, blue, blue, green, purple
  ];

  // With fairness: interleaved across tenants
  const withFairness = [
    blue, green, orange, purple,
    blue, green, orange, purple,
    blue, green, orange, purple,
    blue, green, orange, purple,
    blue, green, orange, purple,
    blue, green, orange, purple,
    blue, green, orange, purple,
    blue, green, orange, purple
  ];

  return (
    <Container sx={{ mt: 3, mb: 6 }}>
      <Typography variant="h3" gutterBottom>
        What is fairness?
      </Typography>

      <Typography variant="body1" paragraph sx={{ fontSize: 18, lineHeight: 1.7 }}>
        Without task queue fairness, tasks are dispatched without any ordering. If your use case has multiple
        tenants, and one tenant has many tasks in the queue (workflow or activity) then their sheer numbers
        threaten to starve other tenants, meaning the smaller tenants' work isn’t processed at the same rate.
      </Typography>
      <Typography variant="body1" paragraph sx={{ fontSize: 18, lineHeight: 1.7 }}>
        With fairness: tasks can be assigned a fairness key and weight. This means many tasks of one type will not
        crowd out fewer tasks of another type, as tasks are distributed fairly.
      </Typography>

      <Box sx={{ mt: 3 }}>
        <Typography variant="h5" gutterBottom>Task Queue Visualization</Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <Chip size="medium" label="Tenant A" sx={{ bgcolor: blue, color: 'white' }} />
          <Chip size="medium" label="Tenant B" sx={{ bgcolor: green, color: 'white' }} />
          <Chip size="medium" label="Tenant C" sx={{ bgcolor: orange, color: 'white' }} />
          <Chip size="medium" label="Tenant D" sx={{ bgcolor: purple, color: 'white' }} />
        </Stack>
        <ExampleBox>
          <Row
            colors={withoutFairness}
            label="Without fairness: one tenant dominates the queue"
            note="Crowding out: other tenants sit behind a long run of Tenant A's tasks."
            result="Unbalanced dispatch across tenants"
            good={false}
          />
        </ExampleBox>
        <ExampleBox good>
          <Row
            colors={withFairness}
            label="With fairness: tasks are interleaved across tenants"
            note="All tenants have been assigned a fairness key with a weight of 1."
            result="Balanced dispatch across tenants"
            good
          />
        </ExampleBox>
      </Box>
    </Container>
  );
}
