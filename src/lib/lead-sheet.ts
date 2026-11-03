/** Keeps the last 2 digits only: "+91 98200 11001" -> "•••••• ••01". */
export function maskPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return "••••••";
  return `•••••• ••${digits.slice(-2)}`;
}

/** One row of the strict `leads` table as returned by GET /api/my-leads. */
export type LeadRow = {
  id: number;
  lead_code: string;
  city_keyword: string | null;
  title: string;
  rating: number | null;
  reviews: number | null;
  niche_or_category: string | null;
  opens_at: string | null;
  website_status: string | null;
  website: string | null;
  status_service: string | null;
  call_status: string | null;
  lead_status: string | null;
  assigned_agent_id: string | null;
  created_at: string | null;
  /** sensitive — masked/null for agents until revealed via POST /api/my-leads/[id] */
  mobile_no: string | null;
  gmap_link: string | null;
  lead_close_amount: string | null;
  has_gmap: boolean;
  has_amount: boolean;
  masked: boolean;
};
