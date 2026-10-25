# Tack

**T**asks for **A**gents, **C**oordinated on **K**anban.

A simple desktop kanban app. Each Markdown project contains its boards, with a dark interface and an Orchid accent.

Built with Rust, Tauri 2, React and TypeScript.

- [Interactive mock](docs/mocks/index.html)
- [Review states and selected logo](docs/mocks/review.html)

## Development

Requires Node and Rust, plus the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```sh
npm install
npm run tauri dev   # run the app
npm test            # format and sync tests
cargo test --manifest-path src-tauri/Cargo.toml
```

## Project files

A project is one Markdown file. Heading levels carry the structure:

```markdown
# Project name

## Board

### Backlog

#### Card title

Description, in ordinary Markdown. Headings inside a description use ##### or ######.

- [x] The final run of task items is the card's checklist
- [ ] Another item
```

The columns are always Backlog, Ready, In Progress, In Review and Finished. Edit the file in any editor and Tack reloads it automatically. If the file can't be read, Tack shows why and pauses changes until it is fixed.
