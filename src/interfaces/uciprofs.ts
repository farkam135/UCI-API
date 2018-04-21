export interface ProfessorObj {
  [name: string]: Professor;
}

export interface Professor {
  name?: string;
  id: number;
  firstName: string;
  lastName: string;
  rating: number;
}

export interface RMPProfessor {
  averageratingscore_rf: number;
  pk_id: number;
  schoolid_s: string;
  teacherfirstname_t: string;
  teacherlastname_t: string;
  total_number_of_ratings_i: number;
}
