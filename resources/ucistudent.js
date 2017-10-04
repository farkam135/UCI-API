//let request = require('request');
import cheerio from 'cheerio';
import  { parseString } from 'xml2js';
import rp from 'request-promise';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/**
 * Logs in the user into webauth, returns a promise that resolves to the authentication token
 * No need to run if the user is already logged in and has an uciauth.
 * For more information and examples visit: TBA
 * @param {string} ucinetid The ucinetid of the user to log in.
 * @param {string} password The password of the user to log in. 
 * @return {promise} A promise that resolves to the student's auth. 
 */
function login(ucinetid, password) {
    let options = {
        url: 'https://login.uci.edu/ucinetid/webauth',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        form: {
            'referer': 'https%3A%2F%2Flogin.uci.edu%2Fucinetid%2Fwebauth',
            'return_url': '',
            'info_text': '',
            'info_url': '',
            'submit_type': '',
            'ucinetid': ucinetid,
            'password': password,
            'login_button': 'Login'
        },
        resolveWithFullResponse: true
    }

    return rp(options)
        .then((response) => {
            let ucinetid_auth = response.headers['set-cookie'][0].split(';')[0];
            if (ucinetid_auth === 'ucinetid_auth=no_key') {
                return Promise.reject('Invalid ucinetid or password');
            }

            return ucinetid_auth;
        })
        .catch((err) => {
            return Promise.reject(err);
        })
}

/**
 * Gets a student's degreeworks object which can be used for personal information as well as classes needed to graduate.
 * For more information and examples visit: TBA
 * TODO: Move parsin logic into it's own function, refactor this mess.
 * @param {string} uciauth UCI student auth provided by login.
 * @return {promise} A promise that resolves to a degreeworks object.
 */
function getDegreeWorks(uciauth) {
    let options = {
        url: 'https://www.reg.uci.edu/dgw/IRISLink.cgi?seg=U',
        method: 'GET',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': [uciauth]
        },
        resolveWithFullResponse: true
    }

    return rp(options).then((response) => {
        //We got the set-cookies, add them to our options and create a post request with the cookies to actually get the dw xml.
        options.url = 'http://www.reg.uci.edu/dgw/IRISLink.cgi';
        options.method = 'POST';
        options['headers']['Content-Length'] = '33';
        options['headers']['Host'] = 'www.reg.uci.edu';
        options['body'] = 'SERVICE=SCRIPTER&SCRIPT=SD2STUCON';
        response.headers['set-cookie'].forEach(function (cookie) {
            options['headers']['Cookie'].push(cookie.split(';')[0]); //Goes through all the set-cookies of the get request and adds them to the options
        });

        return rp(options);
    }).then((response) => {
        let studentData = {};
        let $ = cheerio.load(response.body, {
            normalizeWhitespace: true
        });

        $('#formCallScript input').each(function (i) {
            studentData[$(this)[0].attribs.name] = $(this)[0].attribs.value;
        });

        options['body'] = `SERVICE=SCRIPTER&REPORT=WEB31&SCRIPT=SD2GETAUD%26ContentType%3Dxml&USERID=${studentData['USERID']}&USERCLASS=${studentData['USERCLASS']}&BROWSER=NOT-NAV4&ACTION=REVAUDIT&AUDITTYPE=&DEGREETERM=ACTV&INTNOTES=&INPROGRESS=N&CUTOFFTERM=ACTV&REFRESHBRDG=N&AUDITID=&JSERRORCALL=SetError&NOTENUM=&NOTETEXT=&NOTEMODE=&PENDING=&INTERNAL=&RELOADSEP=TRUE&PRELOADEDPLAN=&ContentType=xml&STUID=${studentData['STUID']}&SCHOOL=${studentData['SCHOOL']}&STUSCH=${studentData['STUSCH']}&DEGREE=${studentData['DEGREE']}&STUDEG=${studentData['STUDEG']}&DEBUG=OFF`;
        options['headers']['Content-Length'] = options['body'].length + '';

        return rp(options);
    }).then((response) => {
        return new Promise((resolve, reject) => {
            parseString(response.body, function (err, result) {
                let Audit = result.Report.Audit[0];
                if (!err) {
                    //Construct clean dw object
                    let dw = {
                        student: {
                            name: Audit.AuditHeader[0]['$'].Stu_name,
                            email: Audit.AuditHeader[0]['$'].Stu_email,
                            id: Audit.AuditHeader[0]['$'].Stu_id,
                            units: Audit.AuditHeader[0]['$'].ResApp,
                            units_p: Audit.AuditHeader[0]['$'].ResAppInProg
                        },
                        courses: {
                            //Added after
                        }
                    }

                    //Add in progress classes
                    let in_progress = [];
                    Audit.In_progress[0].Class.forEach((course) => {
                        in_progress.push(course['$'].Discipline + ' ' + course['$'].Number);
                    });
                    dw.courses.in_progress = in_progress;

                    let advice = {};
                    //Add courses that count towards graduation
                    //Go through all blocks
                    Audit.Block.forEach((block) => {
                        //TODO: Add General Ed Requirements qq
                        if (block['$'].Req_type == 'PROGRAM') {
                            //We skip over gen ed requirements for now
                            return;
                        }

                        //This is a block we care about so check the percent complete, if it is complete or going to be complete this quarter skip it
                        if (parseFloat(block['$'].Per_complete) == 100 || Object.keys(block['$']).includes('In_prog_incomplete')) {
                            return;
                        }

                        let blockName = block['$'].Title;
                        console.log('Scanning Valid Block:', blockName);
                        advice[blockName] = {};

                        //Woo there are some classes we have to take, go through all the rules to check them out
                        let Rules = block.Rule;
                        Rules.forEach((rule) => {
                            //If RuleType is not a course or the course has no advice courses just continue
                            //TODO: Support Rule Groups
                            if (rule['$'].RuleType != 'Course' || !Object.keys(rule).includes('Advice')) {
                                return;
                            }

                            let ruleName = rule['$'].Label;
                            console.log('Scanning Valid Rule:', ruleName);
                            advice[blockName][ruleName] = {
                                "ClassesNeeded": parseInt(rule.Advice[0]['$'].Classes),
                                "Classes": []
                            };

                            //Woo we got some classes in the rule, go through all the classes and add the courses
                            let Courses = rule.Advice[0].Course;
                            Courses.forEach((course) => {
                                let courseName = course['$'].Disc + ' ' + course['$'].Num;
                                advice[blockName][ruleName].Classes.push(courseName);
                            });
                        });
                    });

                    dw.courses.advice = advice;

                    resolve(dw);
                } else reject(err);
            });
        });

    });
}

/**
 * Returns a promise to an array of courses the provided uciauth has registered for.
 * For more information and examples visit: TBA
 * @param {string} uciauth UCI student auth provided by login.
 * @return {promise} The promise to an array of courses the user has registered for.
 */
function getCompletedCourses(uciauth) {
    let options = {
        url: 'https://www.reg.uci.edu/access/student/studylist/?seg=U',
        method: 'GET',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': [uciauth]
        }
        //resolveWithFullResponse: true
    }

    return rp(options).then((response) => {
        let $ = cheerio.load(response, {
            normalizeWhitespace: true
        });

        let completedCourses = {};
        $('#studylistTable tr[valign=top]').each(function (i) {
            let tableData = $(this).children();
            let dept = $(tableData[1]).text();
            let num = $(tableData[2]).text();

            if (!completedCourses.hasOwnProperty(`${dept} ${num}`)) {
                console.log(`${dept} ${num}`);
                completedCourses[`${dept} ${num}`] = true;
            }
        });

        return Object.keys(completedCourses);
    })
    .catch((err) => {
        return Promise.reject(err);
    })
}

/**
 * ### DEPRACATED - NO USE? ###
 * Returns a promise to an array of transfer courses the provided uciauth has taken.
 * For more information and examples visit: TBA
 * @param {string} uciauth Authid provided by login callback.
 * @return {promise} The promise to an array of transfer courses the user has.
 */
/* function getTransferCourses(uciauth) {
    let deferred = Promise.defer();
    //The options for the packet
    let options = {
        url: 'https://www.reg.uci.edu/access/student/transfers/?seg=U',
        method: 'GET',
        headers: headers
    }
    options['headers']['Cookie'] = [uciauth];

    request(options, function (err, response) {
        if (!err && response.statusCode == 200) {
            let $ = cheerio.load(response.body, {
                normalizeWhitespace: true
            });

            let courses = [];
            //console.log("Scanning courses...");
            $('.rowrollover tr').each(function (i) {
                let tableData = $(this).children();
                let courseData = {
                    'School': $(tableData[0]).text(),
                    'Term': $(tableData[1]).text(),
                    'Course': $(tableData[2]).text(),
                    'Title': $(tableData[3]).text(),
                    'Units': $(tableData[4]).text(),
                    'Grade': $(tableData[5]).text()
                };
                courses.push(courseData);
            });

            deferred.resolve(courses);
        }
    });

    return deferred.promise;
} */

module.exports.login = login;
module.exports.getCompletedCourses = getCompletedCourses;
module.exports.getTransferCourses = getTransferCourses;
module.exports.getDegreeWorks = getDegreeWorks;