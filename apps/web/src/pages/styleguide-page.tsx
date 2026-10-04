import { PageTitle, Stack } from '@parkshape/ui';

import { messages } from '../messages';
import { useDocumentMeta } from '../meta/use-document-meta';

import { MotionSection } from './styleguide-motion';
import {
  AccessSection,
  AlertSection,
  BadgeSection,
  ButtonSection,
  FieldSection,
  LayoutSection,
  LoginSection,
  MeterSection,
  RadioSection,
  SelectSection,
} from './styleguide-sections';

/** Every ui component in each state, for review. */
export function StyleguidePage() {
  useDocumentMeta(messages.meta.styleguide);
  return (
    <Stack gap="xlarge" className="web-page">
      <PageTitle lede={messages.styleguide.lede}>{messages.styleguide.heading}</PageTitle>
      <ButtonSection />
      <LoginSection />
      <AlertSection />
      <FieldSection />
      <SelectSection />
      <RadioSection />
      <MeterSection />
      <BadgeSection />
      <LayoutSection />
      <AccessSection />
      <MotionSection />
    </Stack>
  );
}
