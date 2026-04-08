import { redirect } from 'next/navigation';

/** Workflow analytics now lives on Workflow Templates (same admin page). */
export default function AdminWorkflowAnalyticsRedirectPage() {
  redirect('/admin/workflow-templates');
}
