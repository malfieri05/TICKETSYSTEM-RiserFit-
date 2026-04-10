import { redirect } from 'next/navigation';

/** Handbook chat merged into AI Assistant; keep URL for bookmarks. */
export default function HandbookPage() {
  redirect('/assistant');
}
