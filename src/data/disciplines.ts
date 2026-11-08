import type { Discipline } from '@/types/musician';

export const DISCIPLINES: Record<Discipline, { label: string; plural: string; blurb: string }> = {
  'recording-artist': {
    label: 'Recording Artist',
    plural: 'Recording Artists',
    blurb: 'Vocalists, rappers and performers releasing original work.',
  },
  producer: {
    label: 'Producer',
    plural: 'Producers',
    blurb: 'Beatmakers and producers shaping the sound from the ground up.',
  },
  'audio-engineer': {
    label: 'Audio Engineer',
    plural: 'Audio Engineers',
    blurb: 'Recording, mixing and mastering engineers who finish the record.',
  },
  songwriter: {
    label: 'Songwriter',
    plural: 'Songwriters',
    blurb: 'Writers and toplines behind the songs people remember.',
  },
  'multi-disciplinary': {
    label: 'Multi-disciplinary',
    plural: 'Multi-disciplinary',
    blurb: 'Musicians who move between roles in the studio.',
  },
};
