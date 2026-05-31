import { readFile } from 'node:fs/promises';

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

export async function loadFixtureData() {
  const base = new URL('../../data/', import.meta.url);

  const [
    meta,
    preOutbreak,
    days,
    events,
    exploreEvents,
    exploration,
    tags,
    rules,
    partners,
    companionConvert,
    scoring,
  ] = await Promise.all([
    readJson(new URL('meta.json', base)),
    readJson(new URL('pre-outbreak.json', base)),
    readJson(new URL('days.json', base)),
    readJson(new URL('events.json', base)),
    readJson(new URL('explore-events.json', base)),
    readJson(new URL('exploration.json', base)),
    readJson(new URL('tags.json', base)),
    readJson(new URL('rules.json', base)),
    readJson(new URL('partners.json', base)),
    readJson(new URL('companion-convert.json', base)),
    readJson(new URL('scoring.json', base)),
  ]);

  return {
    meta,
    preOutbreak,
    days,
    events: [...events, ...exploreEvents],
    exploration,
    tags,
    rules,
    partners,
    companionConvert,
    scoring,
  };
}
