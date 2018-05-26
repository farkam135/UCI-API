export interface Course {
  YearTerm: string;
  code: string;
  dept: string;
  num: string;
  title: string;
  days: string;
  time: string;
  location: string;
  instructor: string;
  grade?: string;
  DIS?: Course;
}

export interface StudentCourses {
  inProgress: { [key: string]: Course };
  completed: { [key: string]: Course };
}
