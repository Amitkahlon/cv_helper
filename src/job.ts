// What a site reader gets from one job page. Field names match job.json.
export interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  posted_date: string; // YYYY-MM-DD, or "" if unknown
  closed: boolean;
  employment_type: string; // as the site writes it
  seniority: string; // as the site writes it
  description: string;
  employer_link: string; // the employer's posting / apply page, "" if unknown
}
