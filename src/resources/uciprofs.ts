import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { ProfessorObj, RMPProfessor, Professor } from "../interfaces";

axios.defaults.headers.common["Content-Type"] =
  "application/x-www-form-urlencoded";

const PROFS: ProfessorObj = {};

/**
 * Refreshes all the professors from ratemyprofessor so they can later be pulled with {@link getProfessor|getProfessor}.
 * @return {Promise} A promise that resolves if successful.
 */
export async function refreshProfs(): Promise<boolean> {
  const requestConfig: AxiosRequestConfig = {
    url: "http://search.mtvnservices.com/typeahead/suggest/",
    params: {
      solrformat: true,
      callback: "noCB",
      q: "*:* AND schoolid_s:1074",
      defType: "edismax",
      qf:
        "teacherfirstname_t^2000 teacherlastname_t^2000 teacherfullname_t^2000 autosuggest",
      bf: "pow(total_number_of_ratings_i,2.1)",
      sort: "total_number_of_ratings_i desc",
      siteName: "rmp",
      rows: 9999,
      start: 0,
      fl:
        "pk_id teacherfirstname_t teacherlastname_t total_number_of_ratings_i averageratingscore_rf schoolid_s",
      fq: "",
      prefix: 'schoolname_t:"University of California Irvine"'
    }
  };

  try {
    const res: AxiosResponse = await axios.request(requestConfig);
    const profs = JSON.parse(/noCB\(((.|\n)*)\);/g.exec(res.data)[1]); //The response is wrapped in noCB like noCB({...}); so use regex to just get the json

    const RMPProfs: RMPProfessor[] = profs.response.docs;

    RMPProfs.forEach((prof: RMPProfessor) => {
      if (!prof.averageratingscore_rf || prof.total_number_of_ratings_i === 0)
        return; //If they don't have any ratings don't add them to the cache

      const nProf: Professor = {
        id: prof.pk_id,
        firstName: prof.teacherfirstname_t.toUpperCase().split(" ")[0], //Remove the middle initial by splitting
        lastName: prof.teacherlastname_t.toUpperCase(),
        rating: prof.averageratingscore_rf
      };

      nProf.name = `${nProf.lastName}, ${nProf.firstName[0]}.`;
      PROFS[nProf.name] = nProf; //Set the key to the value that is seen in the schedule of classes for lookup.
    });

    return true;
  } catch (e) {
    console.log(e);
    return false;
  }
}

/**
 * Gets a professor's details given their name.
 * @param {string} name The name of the professor in the format ({LAST_NAME}, {FIRST_INITIAL}.)
 * @return {Professor} An object representing a professor.
 */
export function getProfessor(name: string): Professor {
  return PROFS[name];
}
