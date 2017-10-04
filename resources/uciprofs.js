import rp from 'request-promise';

/**
 * An object representing a professor
 * @typedef {Object} Professor
 * @property {number} id - The ratemyprofessor id, which can be used to look the professor up on ratemyprofessor.
 * @property {string} firstName - The professor's first name.
 * @property {string} lastName - The professor's last name.
 * @property {string} rating - The professor's rating [0.0 -> 5.0].
 */

const PROFS = {};
let autoScrapeTimeout = null; //Holds onto the scrape timeout so it can be cancelled with stopAutoScrape

/**
 * Refreshes all the professors from ratemyprofessor so they can later be pulled with {@link getProfessor|getProfessor}.
 * @return {Promise} A promise that resolves if successful. 
 */
function refreshProfs() {
    //The options for the get request. qs pulled from recording network traffic when searching ratemyprofessor. 
    let options = {
        url: 'http://search.mtvnservices.com/typeahead/suggest',
        qs: {
            solrformat: true,
            rows: 5000,
            callback: 'noCB',
            q: '*%3A*+AND+schoolid_s%3A1074',
            defType: 'edismax',
            qf: 'teacherfirstname_t%5E2000+teacherlastname_t%5E2000+teacherfullname_t%5E2000+autosuggest',
            bf: 'pow(total_number_of_ratings_i%2C2.1)',
            sort: 'total_number_of_ratings_i+desc',
            siteName: 'rmp',
            rows: 9999,
            start: 0,
            fl: 'pk_id+teacherfirstname_t+teacherlastname_t+total_number_of_ratings_i+averageratingscore_rf+schoolid_s',
            fq: '',
            prefix: 'schoolname_t%3A%22University+of+California+Irvine%22'
        },
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }

    return rp(options)
        .then((response) => {
            let profs = JSON.parse(/noCB\(((.|\n)*)\);/g.exec(response)[1]); //The response is wrapped in noCB like noCB({...}); so use regex to just get the json
            profs.response.docs.forEach((prof) => {
                if (!prof.averageratingscore_rf || prof.total_number_of_ratings_i === 0) prof.averageratingscore_rf = "NULL"; //If they don't have any ratings set their score to NULL instead of 0

                let nProf = {
                    id: prof.pk_id,
                    firstName: prof.teacherfirstname_t.toUpperCase().split(" ")[0], //Remove the middle initial by splitting
                    lastName: prof.teacherlastname_t.toUpperCase(),
                    rating: prof.averageratingscore_rf
                };

                PROFS[`${nProf.lastName}, ${nProf.firstName[0]}.`] = nProf; //Set the key to the value that is seen in the schedule of classes for lookup.
            });

            return Promise.resolve();
        }).catch((error) => {
            return Promise.reject(error);
        });
}

/**
 * Gets a professor's details given their name.
 * @param {string} name The name of the professor in the format ({LAST_NAME}, {FIRST_INITIAL}.) 
 * @return {Professor} An object representing a professor.
 */
function getProfessor(name) {
    return PROFS[name];
}

/**
 * Starts to automatically scrape ratemyprofessor using {@link refreshProfs|refreshProfs}. If a scrape is successful the next scrape 
 * will run after successInterval seconds, otherwise if something went wrong it will run the next scrape after 
 * failInterval seconds. This is a convenience function and is not needed it just exists so users don't have to worry about running
 * {@link refreshProfs|refreshProfs} every now and then. Note: When invoked, the first refresh is instant
 * @param {number} successInterval The number of seconds to refreshProfs after a successful scrape. 
 * @param {number} failInterval The number of seconds to refreshProfs after a failed scrape.
 */
function startAutoScrape(successInterval, failInterval) {
    function scrape() {
        refreshProfs().then((status) => {
            let interval = (status.success ? successInterval : failInterval) * 1000; //Multiply to convert ms to seconds 

            autoScrapeTimeout = setTimeout(scrape, interval);
        });
    }

    scrape();
}

/**
 * Stops automatically scraping ratemyprofessor.
 */
function stopAutoScrape() {
    clearTimeout(autoScrapeTimeout);
}

refreshProfs();

module.exports.getProfessor = getProfessor;
module.exports.startAutoScrape = startAutoScrape;
module.exports.stopAutoScrape = stopAutoScrape;
module.exports.refreshProfs = refreshProfs;