# Content rules

These rules cover every word in CommonGround: UI strings, constraint messages, seed content, docs and commit messages. `pnpm lint:content` checks most of them. Reviewers check the rest against the checklist below.

## Who we write for

Readers are the residents of a city whose park is open for design. Many read English as a second language, and many use the app on a phone. Write at about a grade 8 reading level. Use the active voice and address the reader as "you".

The `readability` check holds each UI string of two or more sentences to Flesch-Kincaid grade 8, and each doc paragraph to grade 10.

## Copy budgets

| Surface     | Word limit |
| ----------- | ---------- |
| Landing     | 30         |
| Dialog      | 40         |
| Empty state | 20         |

The limit counts every word the reader sees on that surface, including headings and buttons. If the copy does not fit, cut an idea.

## Labels

A label is a noun or a verb phrase in sentence case. It has no full stop. Examples are "Tree canopy", "Add corner" and "Submit design".

## Messages

A message states the fact, then the action. It is at most two sentences.

> Path is 7% grade. Accessible paths are 5% or less.

Do not apologise, blame the reader or explain how the system works inside.

### Error messages

Each failure kind gets one fact sentence, then one action sentence. Keep both within the copy budget. Do not blame the reader. Do not name a status code or a browser in the first sentence.

| Failure kind             | Fact then action                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Page load failed         | This page did not load. Try again, or go to the home page.                           |
| Signed out               | You are signed out. Sign in again to save; your work is kept on this device.         |
| Saved elsewhere          | This design was saved in another tab or on another device. Pick the version to keep. |
| Changed during submit    | Your design changed while it was checked. Submit it again.                           |
| Design too large         | This design is too large to save. Remove a few items, then submit again.             |
| Too many votes           | You voted too many times just now. Try again in {seconds} seconds.                   |
| Too many sign-in tries   | Too many sign-in tries. Try again in {seconds} seconds.                              |
| Server error             | Something went wrong on our side. Try again.                                         |
| Offline                  | Saving paused. Changes are kept on this device.                                      |
| Project closed           | This project is closed to new designs. Vote on designs instead.                      |
| Editing a closed project | The project is closed, so you cannot submit this design. You can still view it.      |

## Numbers over adjectives

Give the number instead of a describing word. Write "12 trees" instead of "lots of trees". Write "Budget is $4,200 over" instead of "Budget is too high". Use numerals for all numbers, and put units after them: 0.5 m, 7%, 250 m².

### Do not explain the obvious

Show the state or the number. Do not narrate a control the reader can already see. Add a piece of copy only when its row below allows it, and delete it otherwise.

| Surface      | Keep only when                                                                                                             | Otherwise                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Helper text  | the field takes an unusual format, or the result is paid or hard to undo, or the term is jargon the resident does not know | delete; the label carries the meaning             |
| Tooltip      | the control is icon only, or it needs a value the label cannot hold such as a shortcut                                     | delete; give the control a text label             |
| Caption      | a chart or image needs a source or a read the marks do not state                                                           | delete; let the visual stand                      |
| Empty state  | the list can be empty and the reader needs the action that fills it, in 20 words or fewer                                  | delete when the list is never empty in normal use |
| Confirmation | the action is destructive, paid or hard to undo                                                                            | delete; run the action and offer undo             |

Do not open a string with these words: This shows, This chart, Use this, Click, Tap, You can, You may, Shows, Displays, Lets you, Allows, Here you.

Help text repeats no content word from its own label. The automated check strips stopwords, stems the rest, and fails when more than one content word is shared.

## Specific headings and buttons

A heading or button names the thing and the act. Compare these pairs.

| Vague       | Specific                    |
| ----------- | --------------------------- |
| Get going   | Design Jonathan Rogers Park |
| Done        | Submit design               |
| Participate | Vote on 5 designs           |

## Terminology

One term names each concept. The rejected synonyms do not appear in locale files. The /staff route and the STAFF_ACCESS_CODE variable are code names and stay.

| Concept                            | Chosen term | Rejected synonyms |
| ---------------------------------- | ----------- | ----------------- |
| The person who runs a project      | Planner     | staff             |
| A resident layout                  | design      | plan, submission  |
| A limit a design is scored against | rule        | constraint, check |
| An object placed in a design       | item        | asset             |
| Recording a preference             | vote        | rate              |

## Never used

- Emoji.
- Exclamation marks.
- Em dashes.
- En dashes used as dashes. An en dash in a number range is fine.
- Curly quotes and apostrophes.
- Title Case headings. Use sentence case.
- Bullets that start with a bold label and a colon.
- Horizontal rules.
- Summary or conclusion sections at the end of a document.
- Hedges that soften a plain fact.
- Closers that ask if the reader needs more help or wish them well.

The banned word list is in `tools/preflight/content-rules.json`. The generated block near the end of this file renders it.

## Trust content

The footer holds one data credit line and the "Data and model sources" disclosure. It has no link groups and no copyright line. The header status is the one word DEMO.

## Review checklist

Check each item by reading the copy aloud.

- Lists are the length the content needs. A list of three written for rhythm is a flag.
- No sentence ends in a tail that starts with an -ing word and says why something matters, such as ", making the park more welcoming".
- No puffery. Say what a thing does and how big it is.
- No vague attribution. Replace "residents want" with the number and the source, such as "62% of 410 voters chose shade".
- Sentence length varies. A run of long sentences is hard to read, and so is a run of short ones.
- Plain verbs win. Prefer "is" and "has" over longer phrases that mean the same thing.
- The specificity test passes. Put the sentence in a different app. If it still makes sense there, it is too general. Rewrite it with a name, a number or a place from this park.

## Surfaces

### UI strings

UI strings live in `apps/web/src/locales/en.json`. Components read them by message ID and never hard-code copy. The ESLint rule `parkshape/no-literal-jsx-text` rejects literal text and literal `alt`, `title`, `placeholder` and `aria-label` values in the `.tsx` files of `apps/web`, `packages/ui` and `packages/scene`, except punctuation, numbers and units. `pnpm lint:content` checks this file with the stricter locale scope, which also rejects exclamation marks and warns on hedges.

### Constraint messages

Messages about grade, spacing, budget and blocked zones come from the rules in `packages/core`. Each message follows the fact then action form, and each has a test that asserts its text.

### Seed content

Seed designs, titles and descriptions in `packages/db/seed` are assembled from a hand-written fragment bank. A model never writes seed text. The fragment bank is checked by `pnpm lint:content`.

### Comment composer

The composer asks for the kind first: Keep, Move, Change, Remove or Question. The note is optional plain text up to 280 characters, with a live count. The privacy line, "Comments show on this design with your name.", sits above Add comment. A refusal states the fact and the action and never blames the resident, such as "Comment is over 280 characters. Shorten it to send." Resident text is not checked against the word list, because that list holds style phrases, not abuse terms. Planners hide a comment instead.

### Generated summary

The summary from `packages/ai` is data. The UI renders it as a quote in a labelled block with the heading "Generated summary". It is never mixed into hand-written copy.

### Docs and commit messages

Markdown docs follow every rule in this file. Commit messages follow them too, and commitlint checks the header and body against the same word list and patterns.

## Generated rules

<!-- preflight:begin section=content -->

| Rule                  | Checks                                                                                           | Tier     | Fix                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `content-wordlist`    | Docs, locale strings and seed text avoid the banned words; review words and hedges warn.         | quick    | Rewrite the sentence in plain words. The word list is in the Word list section.            |
| `content-patterns`    | Docs, locale strings and seed text avoid the banned patterns such as dashes and emoji.           | quick    | Rewrite the text as the message says. Patterns are listed in the Word list section.        |
| `content-redundancy`  | Help text shares at most one content word with its label, and no string narrates a control.      | quick    | Delete the helper text, or reword it so it does not repeat the label or narrate a control. |
| `content-terminology` | One term names each concept; the rejected synonyms in termBans do not appear in locale files.    | quick    | Use the chosen term (Planner, design, rule, item, vote) in place of the rejected synonym.  |
| `readability`         | Multi-sentence locale strings read at grade 8 or lower, and doc paragraphs at grade 10 or lower. | quick    | Split long sentences and use shorter words. The grade is Flesch-Kincaid.                   |
| `licence-attribution` | Every asset and terrain source named in a manifest is credited in the UI attribution.            | standard | Add the source name to the attribution string in `apps/web/src/locales/en.json`.           |

<!-- preflight:end -->

## Word list

<!-- preflight:begin section=wordlist -->

### Banned words

Each word or phrase is an error in docs, UI strings, seed text and commit messages.

| Word                     |
| ------------------------ |
| `additionally`           |
| `align with`             |
| `boasts`                 |
| `bolster`                |
| `crucial`                |
| `delve`                  |
| `elevate`                |
| `empower`                |
| `emphasize`              |
| `enduring`               |
| `enhance`                |
| `ensure`                 |
| `foster`                 |
| `garner`                 |
| `interplay`              |
| `intricate`              |
| `leverage`               |
| `meticulous`             |
| `pivotal`                |
| `robust`                 |
| `seamless`               |
| `showcase`               |
| `streamline`             |
| `tapestry`               |
| `testament`              |
| `underscore`             |
| `unlock`                 |
| `valuable insights`      |
| `vibrant`                |
| `cutting-edge`           |
| `best-in-class`          |
| `get started`            |
| `learn more`             |
| `dive in`                |
| `in today's`             |
| `it's important to note` |
| `in summary`             |
| `in conclusion`          |
| `overall`                |
| `serves as`              |
| `stands as`              |
| `refers to`              |

### Review words

Each word is a warning. Read the sentence and rewrite it when the note applies. Notes and messages are quoted from the rules file.

| Word        | Note                                                           |
| ----------- | -------------------------------------------------------------- |
| `highlight` | `Fine as a noun; rewrite when used as a verb.`                 |
| `key`       | `Fine as a noun (API key); rewrite when used as an adjective.` |
| `landscape` | `Fine for terrain; rewrite when used in the abstract sense.`   |

### Hedges

Each hedge is a warning in UI strings.

| Hedge               |
| ------------------- |
| `may`               |
| `might`             |
| `could potentially` |
| `generally`         |
| `can help`          |

### Patterns

Each pattern is an error in the scope it names.

| Pattern                       | Scope    | Message                                                             |
| ----------------------------- | -------- | ------------------------------------------------------------------- |
| `em-dash`                     | all      | `Replace the em dash with a comma, period, or parentheses.`         |
| `en-dash-as-dash`             | all      | `Do not use a spaced en dash as a dash; use a comma or period.`     |
| `curly-quotes`                | all      | `Use straight quotes and apostrophes.`                              |
| `emoji`                       | all      | `Remove the emoji.`                                                 |
| `ui-exclamation`              | locales  | `UI strings do not use exclamation marks.`                          |
| `not-just-but`                | all      | `State the point directly instead of 'not just X, but Y'.`          |
| `not-only-but-also`           | all      | `State the point directly instead of 'not only X but also Y'.`      |
| `isnt-its`                    | all      | `State the point directly instead of 'isn't X, it's Y'.`            |
| `rather-than-ending`          | all      | `Do not end a sentence on 'rather than'.`                           |
| `sentence-initial-transition` | all      | `Drop the sentence-initial transition word.`                        |
| `bold-header-bullet`          | markdown | `Write the bullet as a sentence instead of a bold label and colon.` |
| `horizontal-rule`             | markdown | `Use a heading instead of a horizontal rule.`                       |
| `title-case-heading`          | markdown | `Use sentence case for headings.`                                   |

<!-- preflight:end -->
