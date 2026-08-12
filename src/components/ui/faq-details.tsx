'use client';

import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import { ChevronDown as ExpandMoreIcon } from '@/components/ui/icons';
import { BRAND } from '@/lib/brand-colors';

type FaqDetailsProps = {
  question: string;
  answer: string;
  accent?: string;
};

export function FaqDetails({ question, answer, accent = BRAND.primary }: FaqDetailsProps) {
  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        mb: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '12px !important',
        '&:before': { display: 'none' },
        overflow: 'hidden',
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon size={22} style={{ color: accent }} />}>
        <Typography fontWeight={600}>{question}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography color="text.secondary">{answer}</Typography>
      </AccordionDetails>
    </Accordion>
  );
}
