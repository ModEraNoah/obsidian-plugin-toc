import { CachedMetadata, Editor, HeadingCache, Notice } from "obsidian";
import { TableOfContentsPluginSettings } from "./types";
import anchor from "anchor-markdown-header";

export interface CursorPosition {
  line: number;
  ch: number;
}

export const getCurrentHeaderDepth = (
  headings: HeadingCache[],
  cursor: CursorPosition
): number => {
  const previousHeadings = headings.filter(
    (heading) => heading.position.end.line < cursor.line
  );

  if (!previousHeadings.length) {
    return 0;
  }

  return previousHeadings[previousHeadings.length - 1].level;
};

const getSubsequentHeadings = (
  headings: HeadingCache[],
  cursor: CursorPosition
): HeadingCache[] => {
  return headings.filter((heading) => heading.position.end.line > cursor.line);
};

const getPreviousLevelHeading = (
  headings: HeadingCache[],
  currentHeading: HeadingCache
) => {
  const index = headings.indexOf(currentHeading);
  const targetHeadings = headings.slice(0, index).reverse();
  return targetHeadings.find((item, _index, _array) => {
    return item.level == currentHeading.level - 1;
  });
};

export const createToc = (
  { headings = [] }: CachedMetadata,
  cursor: CursorPosition,
  settings: TableOfContentsPluginSettings
): string | undefined => {
  const currentDepth = getCurrentHeaderDepth(headings, cursor);
  const subsequentHeadings = getSubsequentHeadings(headings, cursor);
  const includedHeadings: HeadingCache[] = [];

  for (const heading of subsequentHeadings) {
    if (heading.level <= currentDepth) {
      break;
    }

    if (
      heading.level >= settings.minimumDepth &&
      heading.level <= settings.maximumDepth
    ) {
      includedHeadings.push(heading);
    }
  }

  if (!includedHeadings.length) {
    new Notice(
      `No headings below cursor matched settings (min: ${settings.minimumDepth}) (max: ${settings.maximumDepth})`
    );
    return;
  }

  const firstHeadingDepth = includedHeadings[0].level;
  const links = includedHeadings.map((heading) => {
    const itemIndication = (settings.listStyle === "number" && "1.") || "-";
    const indent = new Array(Math.max(0, heading.level - firstHeadingDepth))
      .fill("\t")
      .join("");
    const previousLevelHeading = getPreviousLevelHeading(
      includedHeadings,
      heading
    );

    const prefix = `${indent}${itemIndication}`;
    let displayText = heading.heading
      .replaceAll("#", "")
      .replaceAll("[", "")
      .replaceAll("]", "");
    let linkText;

    if (settings.useMarkdown && settings.githubCompat)
      return `${prefix} ${anchor(displayText)}`;
    else if (settings.useMarkdown) linkText = encodeURI(displayText);
    else if (typeof previousLevelHeading == "undefined") linkText = displayText;
    else linkText = `${previousLevelHeading.heading}#${displayText}`;

    // wikilink format
    if (!settings.useMarkdown)
      return `${prefix} [[#${linkText}|${displayText}]]`;
    // markdown format
    else return `${prefix} [${displayText}](#${linkText})`;
  });

  return `# ${
    settings.title ? settings.title : "Table of Contents"
  }\n ${links.join("\n")}\n`;
};

export function updateToC(
  { headings = [], sections = [] }: CachedMetadata,
  editor: Editor,
  settings: TableOfContentsPluginSettings
): void {
  const title = settings.title ? settings.title : "Table of Contents";
  const tocHeading = headings.find((heading) =>
    heading.heading.contains(title)
  );

  if (!tocHeading) {
    new Notice("No ToC in this file to update");
    return;
  }

  const tocParagraphIndex = sections.findIndex(
    (section) => section.type === "heading"
  );

  const tocPosition = sections[tocParagraphIndex].position;
  const listPosition = sections[tocParagraphIndex + 1].position;

  const headingsCopy = [...headings];
  // copy needed as the original object is kept in the state of the editor
  headingsCopy.shift();

  const cursor = editor.getCursor();
  const toc = createToc(
    { headings: headingsCopy },
    cursor,
    settings
  )?.trimEnd();

  if (toc)
    editor.replaceRange(
      toc,
      { line: tocPosition.end.line, ch: 0 },
      { line: listPosition.end.line, ch: listPosition.end.col }
    );
}
