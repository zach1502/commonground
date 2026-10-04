# Design rules

These rules cover how CommonGround looks and behaves. They apply to every page in `apps/web` and every component in `packages/ui` and `packages/scene`. The review checklist near the end is what reviewers check a UI change against.

## Visual rules

### Colour

The UI uses the design system (the open-source BC Design System tokens and components). Use its tokens from `@bcgov/design-tokens` for every colour. Stylelint rejects raw hex, rgb and named colours in CSS.

The app has one domain palette on top of the tokens. It has terrain greens, soil browns and one water blue, and it is used only in the scene and on maps. Status colours come from the BC support tokens: success, warning, danger and info.

### Type

BC Sans is the only typeface. Use weights 300, 400 and 700 and no others.

Show hierarchy with size, weight and space. Do not use colour or boxes to show that one thing ranks above another.

### Surfaces

Do not use gradients, glass or blur effects, heavy shadows, large corner radii or gradient text. Corner radius is `--layout-border-radius-small` or `--layout-border-radius-medium`. The only shadow is the low elevation token, and it is for floating toolbars and menus.

### Layout

Pages are left-aligned. Reading text is about 72 characters wide.

The 3D viewer, the editor and data views such as the leaderboard and insights run edge to edge.

Do not build a centred hero. The landing page starts with the park name, one sentence and the primary action, all left-aligned.

Do not lay out rows of equal cards. Cards are for design thumbnails only.

Each page has one primary action. Other actions on the page use the secondary or tertiary buttons.

Vary section rhythm. Sections differ in height and density according to what they hold, so a page does not read as a stack of identical blocks.

### Icons

Use one icon set. Icons mark actions and status only and never decorate.

### Motion

Motion shows a state change and nothing else. Durations are 150 ms for small changes and 250 ms for panels and views. A camera move in the scene runs 400 ms. A list enters as one 150 ms reveal, with no stagger. When `prefers-reduced-motion` is set, changes happen with no animation. DOM motion goes through `packages/ui/src/motion`, and scene motion goes through `packages/scene/src/motion`, which uses the same durations and curves.

### Imagery

Do not use stock photos or generated images. Images are renders of real designs, photos of the real site, or maps.

### Page metadata

Every route sets a real title, a description and an Open Graph image. Every image has alt text that says what it shows.

### Forms and access

Every focusable element shows a visible focus ring. Labels sit above fields and help text sits below. Errors appear inline next to the field they belong to. Each page has a skip link and landmark regions for header, navigation, main content and footer.

## Editor

### Camera

The camera orbits a focus point on the terrain. Left-drag on empty ground or right-drag anywhere to orbit. Scroll zooms toward the cursor, and the plus and minus keys zoom too. Zoom stops 4 m from the focus point. The far limit depends on the parcel size only: 1.5 times the distance at which the parcel's bounding sphere fits the 38 degree vertical field of view, which is the tighter one on any canvas at least as wide as it is tall. A window resize or a side column never moves it, and the 1.5 margin keeps the sphere in view down to an aspect of 0.64. The camera stays at least 1 m above the ground, and the focus point stays over the parcel. Middle-drag or the WASD keys pan. Pitch is clamped so the camera never goes under the ground or flips over the top. An edit, an undo or a save never moves the camera; only a view button, a Show me button or a new parcel does.

The view controls are Reset view, Top-down and Bird's eye. A compass shows north and resets the heading when clicked.

### Placing items

The picker in the tools column is a grid of square picture tiles under tabs: Plants, Paths (with lawn, meadow, plaza and parking), Play (with sports), Seating, Garden (with water and the dog area), and Amenities. Each tile shows the item's picture, its name on up to two lines, and its unit cost on its own line in the secondary text colour. A name breaks only between words, never inside one; past the second line, or for a word wider than the tile, it ends in an ellipsis and shows in full on hover. Every name keeps room for two lines, so the costs in a row line up. Tiles are at least 4.5rem wide with a 2 px gap, so the widest word, Community, fits on one line, and a row holds 2 at 1024 px and 3 at 1440 px. The tile being placed has the 2 px selection outline in the focus colour, and hover and press fills come from the press rules in the motion module. The grid is a listbox: arrow keys move, Home and End jump, Enter picks, and each tile is named by its name and cost. The tab stays open after a pick, so a second copy is one click. No tab has more than 24 items, so there is no search field.

Each picture is a 256 px transparent PNG that `pnpm --filter @parkshape/asset-pipeline thumbnails` draws in headless Chromium with the scene's GLB loader, materials and light rig. One orthographic camera looks from the front-left. It looks down 30 degrees at a model that stands up. It looks down 50 degrees at flat ground, so a lawn or a path reads as a surface. A model is flat when its height is under 15 percent of its longer side. Each model's bounding sphere fills 80 percent of the frame, so every tile is full. Size shows in the park, not in the tile. The sun is 60 degrees up, so a tree's shadow fits. The frame grows when a shadow would come within 4 percent of an edge. The manifest records each GLB's hash and the settings hash, so a changed model or camera draws again.

A ghost of the item follows the cursor. It is green where the item can go and red where it is blocked. When it is red, a one-line reason sits next to it, for example "Too close to the playground fence".

A click places the item. Paint mode keeps placing on each click until you press Esc.

Trees vary in size and rotation within 10 percent so a group does not look copied. Benches and other items placed near a path turn to face it.

### Selecting and editing

Click an item to select it. Drag a selected item to move it, and it follows the terrain. Drag a marquee on empty ground to select many items.

A floating toolbar appears above the selection with rotate, duplicate and delete. It stays inside the canvas by the small layout margin: it slides in from a side edge, and with no room above the selection it sits below it. A locked item shows a lock badge. The properties panel shows the selected item's settings.

A new element may not cover a locked one. The rule measures what a design adds. So two features of the park as it is today may overlap, such as a locked tree inside the existing community garden. Messages name elements by their catalog name and never by id, for example "Bench overlaps a locked Flowering cherry".

| Shortcut | Action                     |
| -------- | -------------------------- |
| Delete   | Delete the selection       |
| Ctrl+Z   | Undo                       |
| Ctrl+Y   | Redo                       |
| Ctrl+D   | Duplicate the selection    |
| ?        | Show the list of shortcuts |

### Paths

Draw a path by clicking points. Double-click or press Enter to finish. Backspace removes the last point.

The path ribbon is coloured by grade. It is green up to 5 percent, amber from 5 to 8 percent and red above 8 percent.

Drag a vertex to move it. A plus sign at each segment midpoint adds a vertex.

### Areas

Drag a rectangle to start an area. Then drag its corners or edges to shape it. Add corner puts a new corner on the nearest edge. The area in square metres and the plot count update as you drag.

### Terraform

The terraform tools are raise, lower, smooth, flatten to level, and level under selected item. Radius and strength each have a slider. A preview ring shows where the brush will act. Hold the mouse button to apply.

Cut and fill volumes update while you work. Zones where terraforming is blocked are hatched in red.

### Snapping

Snap to a 0.5 m grid is on by default. A toggle turns it off. Hold Alt to turn it off while you drag.

A path's first or last point, or a Gate, that lands within 5 m of a sidewalk snaps to the parcel edge facing it, 1.5 m inside. A small ring marks the sidewalk point it snapped toward. This snap wins over the grid, Alt turns both off, and with no context loaded or the sidewalk layer off nothing changes.

### Context

The streets, sidewalks, bus stops, bike routes and parking within 300 m of the parcel draw as flat matte ribbons, pins and hatched stalls around the park. Streets, sidewalks and bus stops are on by default. An icon-only "Map layers" button beside the view presets opens a box for each layer, and the choice is kept on this device. The sidebar legend shows a swatch and one or two words for each layer that is on, with no heading. Up to 6 street names show as data labels. The design and vote pages draw the default layers read-only with no menu, and the vote card leaves the street names off. If the context did not load, the menu says so in place of the boxes. The layer costs at most 6 draw calls and casts no shadow.

### Meters and problems

Meters for budget, tree canopy, grade and other targets update within 200 ms of a change. A meter pulses once when its value changes.

Problems that block submission are listed above the Submit button. Each one has a Show me button that moves the camera to the problem and selects it.

Do not use toasts. The one exception is a failed save.

### Saving and undo

Every change saves as you go. The undo history is kept when you reload the page in the same browser session.

Each save sends the `updatedAt` stamp the tab last got from the server. The server saves only if its stamp still matches, so no clock is compared. If another tab saved first, the server sends back 409 and its copy. The editor then asks you to pick "Keep my changes" or "Use the saved version".

### First-visit hints

Two one-line hints show on a first visit, one at a time, and only where a move is not clear from the screen. A camera hint sits over the ground until the first drag or wheel. A path hint shows when the path tool is first picked, and goes once the first point is down. Each hint has one icon-only Dismiss button. Each one clears itself when the move is made, and stays gone for that browser. There is no step tour and no replay control.

### Loading

Loading shows real progress and names the data source, for example "Loading terrain from NRCan HRDEM".

#### Slow conditions

On Slow 4G (400 ms latency, 400 kbps each way) with a 4 times slower CPU, every route draws a heading or a skeleton within 3 s. Each page shows its main heading and first data within 20 s, and the design page draws its 3D view in that time. The desktop editor has 30 s, because it needs about 1.05 MB. A tree placed in the editor updates the canopy meter within 1500 ms. Unthrottled, the budget stays 500 ms. Layout shift stays under 0.1. With no connection, the editor says "Saving paused. Changes are kept on this device." and sends the changes when the connection returns. If the server copy changed in the meantime, for example from another device, the server answers 409 and the editor asks you to pick "Keep my changes" or "Use the saved version". Signing out removes the changes kept on this device. `pnpm --filter @parkshape/web slow` checks these budgets.

### Access

All controls outside the canvas work by keyboard and screen reader. The Items list is the path for people who do not use the canvas: it lists every placed item and has the same actions as the floating toolbar. The canvas itself is a known limit, and we say so in the accessibility statement.

### Screen size

The editor is for desktop only. On small screens it shows a notice that explains this and links to voting.

## Voter and viewer

Voters see one design at a time. Compare with today switches between the design and the site as it is now.

Each design shows first as a picture: its thumbnail, or a flat plan drawn from the design when it has none. The 3D view opens only when the voter presses View in 3D, so the page stays fast on a phone.

The up, down and skip buttons sit in the thumb zone at the bottom of the screen. Swipe right, left and up do the same. While the reason chips are open, Next takes the place of Vote up and swipes do nothing.

After a vote, reason chips appear with a Next button. Tapping a chip records why you voted that way. Next or Skip moves to the next design. Nothing hides on a timer.

Progress reads "3 of 5" and counts toward the voting goal.

The leaderboard shows an arrow next to each design whose rank changed since your last visit.

Share opens the device share sheet with the design's link.

### Feedback and failure

Every failure states the fact, then the action, and keeps the person's work. A failed action never clears a draft, a vote in progress or a form. The message is announced once through a single `role="alert"` for a blocking failure or `role="status"` for a paused or transient one, and it never fires twice for one event.

Copy carries no blame and no internal cause. The first sentence never names a status code or a browser technology. The words come from the CONTENT.md error message table.

Every wait over 1 s shows a static grey skeleton shaped like the result, with no shimmer. Under 1 s shows nothing new. Over 10 s shows percent done, the data source and Cancel.

Motion durations and easings by kind: a small state change, such as a button, a chip, a meter pulse or a reveal, runs 150 ms; a panel, view, dialog or drawer entry runs 250 ms. Entry eases on `cubic-bezier(0.05, 0.7, 0.1, 1)` and exit on `cubic-bezier(0.3, 0, 1, 1)`, and an exit is never longer than its entry. Something that stays on screen and moves, such as the camera or a reordered row, eases on `cubic-bezier(0.2, 0, 0, 1)`. A reorder animates only when the reader caused it, such as the first leaderboard view after their own vote. A meter fill runs 250 ms on width. `linear` appears only on progress bars. Under `prefers-reduced-motion: reduce` every transition and animation is none, and the same information still lands: the chips and Next still appear, the meter numbers still update, and the save line still changes.

Focus lands in a set place. After a dialog closes, focus returns to the control that opened it. After a vote, focus moves to the reasons heading and one polite status reads "Voted up on {design}". After a client route change, focus moves to the new page `h1` and one polite status names the page.

Every 3D view has a text alternative that names the items by kind and count, the cost, and any problem that blocks submission. The read-only viewer labels its canvas "3D view of {design}", not "editor".

Reflow holds at 320, 768, 1024 and 1920 CSS px, at 200% zoom, and with the text-spacing styles applied. At 320 the layout is one column, the header collapses to Menu, and no element extends past the viewport. At 768 the layout is a two-column intermediate with the full nav. At 1024 the three-column layout and the editor are available. At 1920 the page stays left-aligned with the reading column near 72 characters and no content stranded. No route shows document horizontal scroll and no text is clipped.

### Review mode

Review is a mode on a submitted design while the project is open, at `/designs/{id}/review`. The design page leads with one primary action, Review this design; once the project closes it reads See comments and comments are read-only for residents. Planners resolve, reply and hide in both phases.

The 3D view stays read-only. A tap selects an item, a path or an area, draws the selection outline and opens the composer; bare ground does nothing. Each element with open comments carries a count chip. Chips farther than 60 m or behind the camera hide, and above 20 on screen only the top 10 show. The Elements list is the way in without a pointer: every element by kind, each a button such as "Bench, south-west, 3 comments" that selects it, moves the camera there and opens the composer. Above it, an All chip and one chip per category the design has narrow the list, so 40 trees do not bury one bench. The chips are secondary and pick one at a time.

The composer is a labelled region, not a dialog, in the right sidebar at 1024 px and up and under the view below that. Its heading is the element label and takes focus. The five kinds are one radio group drawn as 44 px chips, then an optional note with a live "n of 280 characters" count, the privacy line and one primary Add comment. Cancel and Escape close it and return focus to the row or the view. One polite status reads "Comment added on {label}". A failure keeps the text and shows the CONTENT.md message in one alert. On a new version of a design, the composer also lists the last version's open comments on that element under "On the last version", read-only.

### Walk

Walk the park sits in the viewer toolbar on the design page and in review. On the vote card it is a button under the stage, beside View in 3D and Compare with today; it opens the 3D view and starts the walk, a swipe does not vote while walking, and leaving the walk or moving to the next design brings back the picture or 3D view the card had. It saves the overview pose and drops the eye to 1.6 m over the ground at the entrance nearest the view, facing the middle of the park. Back to overview and Escape put the saved pose back in one frame. The walker follows the terrain and stops or slides at the parcel edge. Items are no obstacle.

| Input                        | Does                                                      |
| ---------------------------- | --------------------------------------------------------- |
| W or ArrowUp, S or ArrowDown | Walk forward or back at 1.4 m/s                           |
| A and D                      | Step sideways                                             |
| ArrowLeft and ArrowRight     | Turn at 90 degrees per second                             |
| Drag                         | Look around; pitch stays within 30 degrees                |
| Tap on the ground            | Walk there                                                |
| Walk pad, touch only         | Walk in the direction pushed, up to the pace set          |
| Turn left, Turn right        | Turn 45 degrees per press                                 |
| Shift or Run                 | One press turns running on, the next turns it off         |
| Mouse look                   | Pointer lock; off until pressed, the first Escape ends it |

Run shows its state as a pressed button, and running ends with the walk. Keys work only while the walk view has focus. Under reduced motion each press of an arrow or letter, or each pad push, is one 4 m step, a tap lands at once, turns go 45 degrees and nothing eases. A 120 px "you are here" map with a heading wedge sits in the corner, hidden from screen readers; a polite live region names the entrance and "Near {label}, {n} m ahead" at most once a second. A walk frame keeps p95 under 33 ms on both tiers.

## Shell and trust

The header uses the design system header layout with the product name "CommonGround" as a text wordmark that links home. It has no logo. Its skip links target `#main-content` first, then `#main-navigation`. The skip link is the first focusable element, before the wordmark. The header collapses to a Menu control at 320 px and shows the full nav at 768 px and up. The header names no government and shows no government mark, because this is a demonstration. It shows the word "DEMO" after the title, bold at the large body size in the secondary text colour. At 360 px the wordmark sits over DEMO, beside Menu, in the one 65 px row.

The footer carries only what the data licences ask for. One line credits Vancouver Open Data and NRCan under the Open Government Licence and OpenStreetMap contributors under the ODbL. Below it, the "Data and model sources" disclosure opens the full attribution in place. The credit line only names sources and licences, so it is marked as data for the word budget. The footer has no link groups and no copyright line. It is one `contentinfo` region. The editor route draws no header and no footer, so the editor fills the window with no page scroll.

Land acknowledgement decision: the demo does not paste a public body's acknowledgement, because that text speaks for that body, which this project is not. The DEMO label says what the site is instead.

Typography and colour use only the named tokens from `@bcgov/design-tokens`. Type sizes run from label .75rem to display 3rem. Primary text uses `--typography-color-primary` and links use `--typography-color-link`. The primary action uses `--surface-color-primary-button-default` and focus uses `--surface-color-border-active`. Body text is at least 16 px on every path. Use the design system component where one exists, rather than a lookalike.

## Interaction

Every drag has a single pointer or keyboard alternative. A path point, an area corner, an item and a terraform brush each place or apply from a click or the keyboard, so no task needs a hold and drag.

Pointer targets are at least 24 by 24 px. Targets on the vote card are 44 by 44 px.

A sticky header, a footer or a floating toolbar never covers the focused control.

Feedback shows within 100 ms of a press, or a progress indicator shows within 1 s.

Every state a component can be in is designed. The states are rest, hover, focus, active, selected, disabled, loading, empty and error.

One term names each concept. The terms are Planner, design, rule, item and vote.

## Planner

Setting up a project is a wizard. Its steps are visible at all times, and you can go back to any step.

Each setting has a one-sentence note on what it does. Each default names its source, for example "Default: 30% (Vancouver Urban Forest Strategy target)".

The review step shows a table and a map side by side. Each row has a lock switch and a plain line that names the data source.

Insights lead with three counts: designs submitted, unique voters and votes cast. Every chart has a caption that says what it shows.

### Charts

| Question                             | Chart                                | Rule                           |
| ------------------------------------ | ------------------------------------ | ------------------------------ |
| Ranking, such as features or reasons | horizontal bar sorted by value       | bars from zero, direct labels  |
| Distribution, such as soil           | histogram, equal bins, numeric order | no reordering by height        |
| Part to whole, such as rules         | per-rule table                       | no pie over 3 segments         |
| Spatial, such as where things go     | one heatmap layer                    | named legend, grey for no data |

Bars start at zero and the axis is never broken. Sort by value unless the category has a natural order. Label bars in place, with no colour-only legend. Use one accent hue plus grey per view, and keep a category in its colour across the page. Show n on every group. Explain suppression once, as "small groups hidden, groups under 5".

The heatmap legend shows the minimum, the maximum, and a plain caption that names the quantity per 1 m cell. It uses a neutral grey for no data, distinct from the zero end. Name the sequential ramp used.

Each chart has an active title that states the finding. Each chart has a text alternative that states the takeaway with the main numbers. Each chart has a table alternative. A printed chart carries the active title, the counted-to time, the n and the source. It shows no page chrome and no clipped labels.

## Finish and rhythm

These rules add to the visual rules above. Each one has a check that a script, a test or a screenshot review can run. Values come from the BC layout and typography tokens.

| Rule                                                                                                                                                                                   | Check                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spacing uses only BC layout tokens. Gaps inside a group are smaller than gaps between groups.                                                                                          | A computed-style script finds no margin, padding or gap off the token scale. In a form, the label-to-field gap is at most half the field-to-next-label gap.                                                                                                |
| A page uses at most 3 heading sizes. Space above a heading is larger than space below it.                                                                                              | Outside the landing page the H1 is at most 2.5 times body size, and body text is at least 16 px.                                                                                                                                                           |
| Body line height is 1.4 to 1.5. Headings at 24 px and up use 1.1 to 1.25.                                                                                                              | Every prose block has a `max-width` between 45ch and 75ch at 1440 px.                                                                                                                                                                                      |
| Weight 300 is for text at 24 px and up.                                                                                                                                                | A computed-style script finds no weight 300 below 24 px.                                                                                                                                                                                                   |
| Greys carry the page. Blue marks actions and links, and status colours mark real status.                                                                                               | Outside the scene and maps, a screenshot shows no other hue. Text passes 4.5:1 and control borders pass 3:1. No `color-mix` or opacity makes a new shade.                                                                                                  |
| Data pages are dense and decision pages are loose.                                                                                                                                     | At 1280 by 800 the leaderboard shows 12 rows above the fold, or every row when it has fewer. At 390 by 844 the vote page shows one design and all 3 vote buttons with no scroll.                                                                           |
| The header, content and footer of a page share one left edge.                                                                                                                          | On an 8 px grid overlay the header wordmark and the H1 start on the same column, and the reading column has at most 3 left edges.                                                                                                                          |
| The primary button sits on the left after the last field. The danger style is for the confirm step of a destructive action only.                                                       | Each viewport screenshot has 1 filled button. Vote down uses the secondary style.                                                                                                                                                                          |
| Every list, table and chart has a loading, an empty and an error state. Empty and error text says what happened and links the task that fixes it, in 20 words or fewer.                | Each state has a component test. No empty message renders before the data resolves.                                                                                                                                                                        |
| Feedback matches the wait. Under 1 s shows nothing new. From 1 to 10 s shows a static skeleton shaped like the final layout. Over 10 s shows percent done, the data source and Cancel. | A Playwright trace shows 100 ms or less from press to first change, and 0 layout shift when a skeleton resolves.                                                                                                                                           |
| Buttons stay enabled. A blocked action says why when you press it.                                                                                                                     | Submit design with problems moves focus to the problem list. A control that stays disabled has visible text that names the reason.                                                                                                                         |
| A panel or wizard step shows 5 settings or fewer before a disclosure. The disclosure names what it holds and never nests.                                                              | Component tests count the visible fields.                                                                                                                                                                                                                  |
| Motion enters on `cubic-bezier(0.05, 0.7, 0.1, 1)` and exits on `cubic-bezier(0.3, 0, 1, 1)`. An exit is never longer than its entry.                                                  | `packages/ui/src/motion` exports only the entry, exit and move curves and the 150 ms and 250 ms durations, and `packages/scene/src/motion` mirrors those durations and curves and adds one 400 ms camera duration. `linear` appears only on progress bars. |
| The floating toolbar, footer or a sticky header never covers the focused element. Esc closes a dialog or menu and returns focus to the control that opened it.                         | A keyboard walk screenshots every tab stop and checks the BC focus ring at 3:1 against its neighbours.                                                                                                                                                     |
| Tables right-align numbers with tabular figures, put the unit in the header and use 1 px rules. The header row sticks when the table is taller than the viewport.                      | A test reads `text-align` and `font-variant-numeric` on numeric cells. A header reads "Area, m²" and its cells hold bare numbers.                                                                                                                          |
| Inputs have no placeholder and are sized to their content. Short numbers carry a unit suffix that the label repeats.                                                                   | A DOM test finds no `placeholder`. Each hint is under 15 words and linked by `aria-describedby`.                                                                                                                                                           |
| Forms validate on submit. The error summary takes focus and the page title starts with "Error: ". Live meters are status and do not count as validation.                               | In an e2e test, leaving an invalid field shows no error.                                                                                                                                                                                                   |
| Targets on phone paths are 44 by 44 px. Every other target is at least 24 by 24 px. Links inside a sentence are exempt.                                                                | A test reads `boundingBox()` for each control on `/vote` at 390 px and in the editor toolbar.                                                                                                                                                              |
| A page uses 2 corner radii, 2 border widths (1 px for rules and inputs, 2 px for focus and selection) and 2 icon sizes (16 px inline, 24 px in toolbars).                              | A computed-style audit per route counts the distinct values.                                                                                                                                                                                               |
| Pages with vote counts say when they were counted, as "Votes counted to 3 October 2026, 3:20 pm".                                                                                   | The leaderboard and insights pages render the time from the API response.                                                                                                                                                                                  |

### Tells to reject

These patterns make a page look generated. Reviewers reject them on sight.

- Cards take the height of their content. Text is never clamped to equal heights with an ellipsis.
- Body text of more than one line is left-aligned, in empty states and dialogs too.
- The insight counts are a sentence or a definition list at heading size. Big-number tiles are not used.
- Headings have no icon in a tinted circle or square in front of them.
- Pages have no blobs, wave dividers, dot grids or noise backgrounds.
- Headings have no small uppercase label above them.
- Cards do not lift or gain a shadow on hover.
- Buttons and inputs do not use a pill radius.
- A badge marks a real status. A badge that every row shares is hidden.
- Secondary text uses the BC secondary text token and passes 4.5:1.
- Focus rings use the BC focus token and are never a blurred `box-shadow` glow.
- Skeletons are static grey blocks with no shimmer.
- Padding follows the density of the page, so boxes do not all share one value.
- Seed slugs and test projects never appear in a public view.

A CSS grep for `text-align: center`, `9999px`, `text-transform: uppercase` and `translateY` inside `:hover` finds each of these in review.

### Cognitive load

Every screen has one dominant element. Size and weight rank it above the rest, and no second block reads at the same volume.

Count the visible words that are not data. Data is the reader's own content and computed values: counts, grades, budgets, ranks, names and titles. A tool screen stays under 60 non-data words at once. Tool screens are the editor, the wizard refine step, terraform, the shortcuts sheet and the Items list. A data screen stays under 120. Data screens are insights, the leaderboard, the gallery, staff home, the projects list, the wizard review and rules steps, the design page and the styleguide. A decision screen stays under 25, and the labels of the form fields the reader fills do not count. Decision screens are the vote card, the submit dialog, new design, describe, login, self report, wizard steps 1, 2 and 6, landing, home, the project page and not found.

Helper text shows only when the CONTENT.md decision table allows it. A caption states a source or a read the marks do not give, and never narrates the visual. A tooltip never repeats the label of its control. An empty state is one line and one action. Onboarding lives in the affordances, so a ghost, a preview or an inline reason teaches the task in place of a paragraph. A move the affordances do not show gets a single one-line hint that dismisses itself the first time the resident makes the move.

Mark data in the DOM with `data-kind="data"` so a test can exclude it and measure the budget. Words inside a closed disclosure are not visible, so only its summary counts.

## Scene rendering

These rules set the look of the 3D viewer, editor, thumbnail and heatmap in `packages/scene`. Colours come from `ScenePalette` in `packages/scene/src/palette/colours.ts`, which gains a `sky` value of `#cfe3f0`. Each number is a named constant next to its one user. Tune a value by screenshot inside its stated range.

### Light

The sun is a directional light, colour `#fff1dc` and intensity 2.5 to 3, at 40 degrees elevation. It sits 100 to 120 degrees around from the reset camera heading, so faces turned away from it go darker. A unit test checks that the sun and the reset view direction differ by more than 60 degrees.

The hemisphere light has `sky` above and `soilDark` below, at intensity 0.6 to 0.9. A generated environment with 2 Lightformer planes in the same colours adds fill and downloads nothing. With it on, the hemisphere drops to 0.3 and the ambient light goes. Tone mapping is ACES filmic at exposure 0.9 to 1.1, and output is sRGB. The phone tier uses exposure 1 and the desktop tier 1.1, so both tiers read the same in colour and the desktop tier only adds shadows and AO. Compare the two tiers side by side on `?park=seed` after any change here.

### Shadows

One directional shadow map covers the parcel. It is 2048 px on desktop and 1024 px on the phone tier, with sides at 100 m from the parcel centre, near 1 m and far 400 m. Bias is -0.0005 and normal bias is 0.04. Raise normal bias to 0.08 before you change bias. The map redraws on load, after an edit and after a sun change, and `autoUpdate` is off. Trees, buildings, benches, lamp posts and figures cast. Terrain, paths and water receive. The seeded scene has fewer than 40 casting meshes. Flat-plane shadows such as drei `ContactShadows` float or sink on sloped ground, so they are for flat thumbnail shots only.

### Sky and fog

The background is the flat `sky` colour. Exponential fog in the same colour at density 0.0015 fades the island edge. With the composer on, three.js mixes fog into the linear colour before ACES rather than into the display colour after it, which lifts the darks toward the sky and turns the soil skirt grey. The desktop tier therefore uses density 0.0008. `sceneTone` in `components/lighting.ts` holds both pairs. The scene has no sky dome, no sunset band and no HDRI download. A pixel test checks that the top corner of the canvas equals the fog colour.

### Ground, paths and water

Terrain vertex colours follow slope: `terrainGrass` under 8 percent, a blend to `terrainMeadow` from 8 to 20 percent, and `soil` above 20 percent. Garden beds use `soilDark`. A greyscale 512 px detail map repeats every 4 m and multiplies the vertex colour, so it adds grain and no hue. The lawn in a screenshot spans less than 10 degrees of hue. The skirt is 1.5 m deep in `soilDark`. While any context layer is on, a flat apron at the parcel-edge mean height runs 300 m out, so the island no longer floats. In a 60 m blend band at the parcel edge, each apron point starts at the height of the nearest edge cell and eases to the mean, so the sidewalks meet the park edge with no step. The outer 60 m blends to `sky` under the fog. Terrain normals are smooth, and props keep their flat shading. Metalness is 0, and roughness is 0.5 or more on every surface except water.

Path textures are tinted to `pathSurface` or `soil`, with UVs in metres and a 1 m repeat. Water is `water` at roughness 0.15, with 2 normal maps that scroll at 0.02 and 0.013 UV per second in opposite directions. It stays still with reduced motion and on the phone tier. Do not use the three.js `Water` or `Reflector` addons, which draw the scene twice.

### Props and density

Trees show their 15-year size: half the mature model the asset pipeline fits to the catalog height, scaled uniformly, varied within 10 percent, and foliage varies within 6 percent lightness through `instanceColor`. Benches, bins, lamps and bike racks are design items, so the viewer never adds them. For the seed designs and the site as it is today, the targets are a bench within 3 m of half the path-side trees, a bin by each bench, a lamp every 25 m on the main path and a bike rack at each entrance. Figures, ground clutter and birds are dressing. They come from the seeded random port, cannot be selected and never count in meters. The targets are 8 to 12 figures at 1.6 to 1.8 m, 60 to 120 clutter instances with no shadow that hide past 250 m, and 6 to 10 birds at 20 to 30 m that hide with reduced motion.

### Post-processing

The desktop tier may use one `EffectComposer` with `multisampling={0}` and the canvas `antialias` off. It holds N8AO at half resolution with `quality="performance"`, radius 2 m, intensity 2 and colour `#1f2a1c`. It also holds SMAA and the ACES tone mapping pass, since three.js skips its own tone mapping when the composer renders to a target. The clear colour is the sky run back through ACES, so the sky still matches the page. The composer has no vignette, because a vignette shades the sky corners away from the fog colour. The selection outline is a 2 px ground line in the BC focus colour. Bloom, depth of field, chromatic aberration, film grain, lens flare, god rays, scene-wide outlines and toon shading are not allowed.

### Framing

Field of view is 38 degrees. The reset view looks down 30 to 35 degrees. `fitPose` in `camera/fit.ts` uses the canvas's real aspect. It centres the parcel box on screen, keeps every corner inside an 8 percent margin, and fills 70 to 78 percent of the axis that binds first. On a wide canvas, such as the design page and describe-it band, that is the height, so the park is never cropped. The editor, viewer, thumbnail and heatmap use the same framing. The near plane is 1 m and the far plane is 5000 m.

### Frame budget

The viewer picks a tier once and passes it down as a prop. It uses the phone tier when a WebGL2 context created with `failIfMajorPerformanceCaveat` fails, when `navigator.hardwareConcurrency` is 4 or less, or when the pointer is coarse. drei `PerformanceMonitor` moves a desktop session to the phone tier on decline. The phone tier has no composer, a 1024 px shadow map or blob shadows only, no detail maps, no birds or clutter, still water and a device pixel ratio of 1. Test builds (`VITE_EDITOR_TEST_HOOK=on`) honour `?tier=desktop` on the web routes, which pins the desktop features without the caveat or a decline, so screenshots in software WebGL show the real look. Real users never get it: the probe and `PerformanceMonitor` stay on.

## Review checklist

1. Colours come from BC tokens or the domain palette.
2. Text is BC Sans at weight 300, 400 or 700.
3. The page has no gradients, glass, heavy shadows, large radii or gradient text.
4. The page is left-aligned with reading text near 72 characters.
5. The page has one primary action and no rows of equal cards.
6. Motion marks a state change only and honours `prefers-reduced-motion`.
7. Images are real, and each has alt text.
8. The route sets a title, description and Open Graph image.
9. Focus rings show, labels sit above fields and errors are inline.
10. `pnpm e2e` passes.

## Generated rules

<!-- preflight:begin section=design -->

| Rule                | Checks                                                                                                                                                 | Tier     | Fix                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------- |
| `design-tokens`     | CSS uses design tokens, and motion lives only in `packages/ui/src/motion` or `packages/scene/src/motion`.                                              | quick    | Use a `var()` token, and animate through the motion helpers in `packages/ui` or `packages/scene`.         |
| `catalog-integrity` | Catalog ids are unique; each modelKey is in the manifest, within 2% of its footprint, with a scale policy and licence; each item has a picker picture. | standard | Run the asset pipeline for the model and its thumbnails, or fix the entry in `packages/core/src/catalog`. |

<!-- preflight:end -->
