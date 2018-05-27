export interface SelectElement {
  name: string;
  value: string;
}

export interface SearchParams {
  YearTerm?: string;
  Breadth?: string;
  Dept?: string;
  CourseNum?: string;
  Division?: string;
  CourseCodes?: string;
  InstrName?: string;
  CourseTitle?: string;
  ClassType?: string;
  Units?: string;
  Days?: string;
  StartTime?: string;
  EndTime?: string;
  MaxCap?: string;
  FullCourses?: string;
  FontSize?: string;
  CancelledCourses?: string;
  Bldg?: string;
  Room?: string;
  Submit?: string;
}

export interface Course {
  dept: string;
  num: string;
  name: string;
  offerings?: CourseOffering[];
  offeringCodes?: string[];
}

export interface CourseOffering {
  Code: string;
  Type: string;
  Sec?: string;
  Units: string;
  Instructor: string[];
  Time: string;
  Place: href;
  Final: string;
  Max: string;
  Enr: string;
  WL?: string;
  Req: string;
  Nor?: string;
  Rstr: string;
  Textbooks: href;
  Web: href;
  Status?: string;
  [key: string]: string | string[] | href;
}

export interface href {
  value: string;
  href: string;
}

export interface Catalogue {
  [key: string]: CatalogueEntry;
}

export interface CatalogueEntry {
  fullName: string;
  description: string;
}

export interface PreReqs {
  [key: string]: string[][];
}

export interface SOC {
  [key: string]: SOCEntry;
}

export interface SOCEntry {
  fullName?: string;
  description?: string;
  course?: Course;
  prereqs?: string[][];
}
