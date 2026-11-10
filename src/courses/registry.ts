import type { CourseFile } from './course';

// Every JSON file in ./data is a course. Adding a race = adding a file.
const files = import.meta.glob<CourseFile>('./data/*.json', { eager: true, import: 'default' });

export const COURSES: CourseFile[] = Object.values(files).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.title.localeCompare(b.title));

export function courseFile(id: string): CourseFile {
  return COURSES.find(c => c.id === id) ?? COURSES[0];
}
