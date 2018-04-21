"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
axios_1.default.defaults.headers.common["Content-Type"] =
    "application/x-www-form-urlencoded";
const PROFS = {};
/**
 * Refreshes all the professors from ratemyprofessor so they can later be pulled with {@link getProfessor|getProfessor}.
 * @return {Promise} A promise that resolves if successful.
 */
function refreshProfs() {
    return __awaiter(this, void 0, void 0, function* () {
        const requestConfig = {
            url: "http://search.mtvnservices.com/typeahead/suggest/",
            params: {
                solrformat: true,
                callback: "noCB",
                q: "*:* AND schoolid_s:1074",
                defType: "edismax",
                qf: "teacherfirstname_t^2000 teacherlastname_t^2000 teacherfullname_t^2000 autosuggest",
                bf: "pow(total_number_of_ratings_i,2.1)",
                sort: "total_number_of_ratings_i desc",
                siteName: "rmp",
                rows: 9999,
                start: 0,
                fl: "pk_id teacherfirstname_t teacherlastname_t total_number_of_ratings_i averageratingscore_rf schoolid_s",
                fq: "",
                prefix: 'schoolname_t:"University of California Irvine"'
            }
        };
        try {
            const res = yield axios_1.default.request(requestConfig);
            const profs = JSON.parse(/noCB\(((.|\n)*)\);/g.exec(res.data)[1]); //The response is wrapped in noCB like noCB({...}); so use regex to just get the json
            const RMPProfs = profs.response.docs;
            RMPProfs.forEach((prof) => {
                if (!prof.averageratingscore_rf || prof.total_number_of_ratings_i === 0)
                    return; //If they don't have any ratings don't add them to the cache
                const nProf = {
                    id: prof.pk_id,
                    firstName: prof.teacherfirstname_t.toUpperCase().split(" ")[0],
                    lastName: prof.teacherlastname_t.toUpperCase(),
                    rating: prof.averageratingscore_rf
                };
                nProf.name = `${nProf.lastName}, ${nProf.firstName[0]}.`;
                PROFS[nProf.name] = nProf; //Set the key to the value that is seen in the schedule of classes for lookup.
            });
            return true;
        }
        catch (e) {
            console.log(e);
            return false;
        }
    });
}
exports.refreshProfs = refreshProfs;
/**
 * Gets a professor's details given their name.
 * @param {string} name The name of the professor in the format ({LAST_NAME}, {FIRST_INITIAL}.)
 * @return {Professor} An object representing a professor.
 */
function getProfessor(name) {
    return PROFS[name];
}
exports.getProfessor = getProfessor;
//# sourceMappingURL=uciprofs.js.map