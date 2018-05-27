export interface StudentCourse {
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
  DIS?: StudentCourse;
}

export interface StudentCourses {
  inProgress: { [key: string]: StudentCourse };
  completed: { [key: string]: StudentCourse };
}
