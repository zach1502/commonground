import { useState, type ReactNode } from 'react';

import {
  Badge,
  BcServicesCardButton,
  Button,
  ButtonLink,
  InlineAlert,
  Inline,
  Meter,
  RadioGroup,
  Select,
  SkipLink,
  Stack,
  TextField,
  VisuallyHidden,
} from '@parkshape/ui';

import { format, messages } from '../messages';

const { sections, sample } = messages.styleguide;
// The sample meters say what the editor meters say, so the styleguide shows residents' words.
const meterStatus = messages.editor.meters.status;
const noop = () => undefined;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="web-styleguide__section" aria-label={title}>
      <h2 className="web-heading-2">{title}</h2>
      {children}
    </section>
  );
}

export function ButtonSection() {
  return (
    <Section title={sections.buttons}>
      <Inline gap="medium">
        <Button variant="primary">{sample.primary}</Button>
        <Button variant="secondary">{sample.secondary}</Button>
        <Button variant="tertiary">{sample.tertiary}</Button>
        <Button variant="danger">{sample.danger}</Button>
        <Button isDisabled>{sample.disabled}</Button>
        <ButtonLink href="#buttons" variant="secondary">
          {sample.link}
        </ButtonLink>
      </Inline>
    </Section>
  );
}

export function LoginSection() {
  return (
    <Section title={sections.login}>
      <BcServicesCardButton
        label={format(messages.login.asPersona, { name: messages.login.sampleName })}
        demoTag={messages.login.demoTag}
      />
    </Section>
  );
}

export function AlertSection() {
  return (
    <Section title={sections.alerts}>
      <Stack gap="small">
        <InlineAlert tone="info" title={sample.alertInfoTitle} />
        <InlineAlert tone="success" title={sample.alertSuccessTitle} />
        <InlineAlert
          tone="warning"
          title={sample.alertWarningTitle}
          description={sample.alertDescription}
        />
        <InlineAlert
          tone="danger"
          title={sample.alertDangerTitle}
          description={sample.alertDescription}
        />
      </Stack>
    </Section>
  );
}

export function FieldSection() {
  const [value, setValue] = useState(sample.fieldValue);
  return (
    <Section title={sections.fields}>
      <Stack gap="medium" className="web-form">
        <TextField
          label={sample.fieldLabel}
          description={sample.fieldHelp}
          value={value}
          onChange={setValue}
        />
        <TextField
          label={sample.fieldLabel}
          value=""
          onChange={noop}
          errorMessage={sample.fieldError}
        />
        <TextField label={sample.fieldLabel} value={sample.fieldValue} onChange={noop} isDisabled />
      </Stack>
    </Section>
  );
}

const SURFACES = [
  { id: 'asphalt', label: sample.selectAsphalt },
  { id: 'gravel', label: sample.selectGravel },
];

export function SelectSection() {
  const [surface, setSurface] = useState<string | null>('gravel');
  return (
    <Section title={sections.select}>
      <Stack gap="medium" className="web-form">
        <Select
          label={sample.selectLabel}
          options={SURFACES}
          value={surface}
          onChange={setSurface}
        />
        <Select
          label={sample.selectLabel}
          placeholder={sample.selectPlaceholder}
          options={SURFACES}
          value={null}
          onChange={noop}
          errorMessage={sample.selectError}
        />
        <Select
          label={sample.selectLabel}
          options={SURFACES}
          value="asphalt"
          onChange={noop}
          isDisabled
        />
      </Stack>
    </Section>
  );
}

export function RadioSection() {
  const [bench, setBench] = useState('wood');
  return (
    <Section title={sections.radio}>
      <RadioGroup
        label={sample.radioLabel}
        value={bench}
        onChange={setBench}
        options={[
          { value: 'wood', label: sample.radioWood, description: sample.radioWoodHelp },
          { value: 'steel', label: sample.radioSteel },
        ]}
      />
    </Section>
  );
}

export function MeterSection() {
  return (
    <Section title={sections.meters}>
      <Stack gap="medium">
        <Meter
          label={sample.meterBudget}
          value={38}
          limit={50}
          status="ok"
          valueText={sample.meterBudgetValue}
          statusText={meterStatus.ok}
        />
        <Meter
          label={sample.meterCanopy}
          value={24}
          limit={30}
          status="warn"
          valueText={sample.meterCanopyValue}
          statusText={meterStatus.warn}
        />
        <Meter
          label={sample.meterGrade}
          value={9}
          limit={5}
          status="fail"
          valueText={sample.meterGradeValue}
          statusText={meterStatus.fail}
        />
      </Stack>
    </Section>
  );
}

export function BadgeSection() {
  return (
    <Section title={sections.badges}>
      <Inline gap="small">
        <Badge>{sample.badgeNeutral}</Badge>
        <Badge tone="info">{sample.badgeInfo}</Badge>
        <Badge tone="success">{sample.badgeSuccess}</Badge>
        <Badge tone="warning">{sample.badgeWarning}</Badge>
        <Badge tone="danger">{sample.badgeDanger}</Badge>
      </Inline>
    </Section>
  );
}

export function LayoutSection() {
  return (
    <Section title={sections.layout}>
      <Stack gap="small">
        <Inline gap="large">
          <span>{sample.one}</span>
          <span>{sample.two}</span>
          <span>{sample.three}</span>
        </Inline>
      </Stack>
    </Section>
  );
}

export function AccessSection() {
  return (
    <Section title={sections.access}>
      <Stack gap="small">
        <p className="web-empty">{sample.accessNote}</p>
        <SkipLink targetId="main-content">{sample.skipLink}</SkipLink>
        <VisuallyHidden>{sample.hidden}</VisuallyHidden>
      </Stack>
    </Section>
  );
}
