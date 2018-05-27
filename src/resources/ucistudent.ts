import { load } from "cheerio";
import { parseString } from "xml2js";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { StudentCourse, StudentCourses } from "../interfaces";

axios.defaults.headers.common["Content-Type"] =
  "application/x-www-form-urlencoded";

/**
 * Logs the user into webauth, returns a promise that resolves to the authentication token.
 * No need to run if the user is already logged in and has an uciauth.
 * For more information and examples visit: TBA
 * @param {string} ucinetid The ucinetid of the user to log in.
 * @param {string} password The password of the user to log in.
 * @return {Promise<string>} A promise that resolves to the student's auth.
 */
export async function login(
  ucinetid: string,
  password: string
): Promise<string> {
  const requestConfig: AxiosRequestConfig = {
    url: "https://login.uci.edu/ucinetid/webauth",
    method: "POST",
    params: {
      referer: "https%3A%2F%2Flogin.uci.edu%2Fucinetid%2Fwebauth",
      return_url: "",
      info_text: "",
      info_url: "",
      submit_type: "",
      ucinetid: ucinetid,
      password: password,
      login_button: "Login"
    }
  };

  try {
    const res: AxiosResponse = await axios.request(requestConfig);

    const ucinetid_auth: string = res.headers["set-cookie"][0].split(";")[0];
    if (ucinetid_auth === "ucinetid_auth=no_key") {
      const $ = load(res.data, {
        normalizeWhitespace: true
      });

      throw new Error($("#status").text());
    }

    return ucinetid_auth;
  } catch (e) {
    throw e;
  }
}

export async function getCourses(uciauth: string): Promise<StudentCourses> {
  const studyListRequest: AxiosRequestConfig = {
    url: "https://www.reg.uci.edu/access/student/studylist/?seg=U",
    method: "GET",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: [uciauth]
    }
  };
  const transcriptRequest: AxiosRequestConfig = {
    url: "https://www.reg.uci.edu/access/student/transcript/?seg=U",
    method: "GET",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: [uciauth]
    }
  };

  const [{ data: studyList }, { data: transcript }] = await Promise.all([
    axios.request(studyListRequest),
    axios.request(transcriptRequest)
  ]);

  //First let's populate all the courses in their study list
  let $ = load(studyList, {
    normalizeWhitespace: true
  });

  const courses: { [key: string]: StudentCourse } = {};
  $("#studylistTable tr[valign=top]").each(function(i) {
    let tableData = $(this).children();
    let YearTerm = /\?YearTerm=(.+?)&/.exec(
      $($(tableData[0]).children()[0]).attr("href")
    )[1]; //We have to get the a tag within the tableData and then extract the YearTerm from the href
    let code = $(tableData[0])
      .text()
      .trim();
    let dept = $(tableData[1]).text();
    let num = $(tableData[2]).text();
    let title = $(tableData[3]).text();
    let type = $(tableData[4]).text();
    let opt = $(tableData[7]).text();
    let days = $(tableData[8])
      .text()
      .trim();
    let time = $(tableData[9])
      .text()
      .trim();
    let location = $(tableData[10]).text();
    let instructor = $($(tableData[11]).find("tr")[0])
      .text()
      .trim(); //We only care about the main instructor (the first one)

    //We don't care about storing TUT courses
    if (type === "TUT") {
      return;
    }
    //They retook a class, only use the latest one.
    if (type === "LEC" && courses.hasOwnProperty(`${dept} ${num}`)) {
      return;
    }

    let newCourse: StudentCourse = {
      YearTerm,
      code,
      dept,
      num,
      title,
      days,
      time,
      location,
      instructor
    };
    if (type === "DIS") {
      //Supplementary course, add it to its lecture course object
      courses[`${dept} ${num}`][type] = newCourse;
    } else if (opt !== "") {
      //Main course
      courses[`${dept} ${num}`] = newCourse;
    }
  });

  const completedCourses: { [key: string]: StudentCourse } = {};

  //Now let's get their grades and add them to their corresponding course. If a course has a grade add it to the completedCourses object
  $ = load(transcript, {
    normalizeWhitespace: true
  });

  $("#chrono-view tr.grades").each(function() {
    let tableData = $(this).children();
    let dept = $(tableData[2]).text();
    let num = $(tableData[3]).text();
    let grade = $(tableData[5]).text();
    let courseIdentifier = `${dept} ${num}`;
    //Add their grade to the courses and move them to the completedCourses object
    if (courses[courseIdentifier] === undefined) {
      return;
    }
    courses[courseIdentifier].grade = grade;
    completedCourses[courseIdentifier] = courses[courseIdentifier];
    delete courses[courseIdentifier];
  });

  return {
    inProgress: courses,
    completed: completedCourses
  };
}

/**
 * Gets a student's degreeworks object which can be used for personal information as well as classes needed to graduate.
 * For more information and examples visit: TBA
 * TODO: Move parsin logic into it's own function, refactor this mess.
 * @param {string} uciauth UCI student auth provided by login.
 * @return {Promise<Result>} A promise that resolves to a degreeworks object.
 */
// async function getDegreeWorks(uciauth: string): Promise<Result<any>> {
//   const requestConfig: AxiosRequestConfig = {
//     url: "https://www.reg.uci.edu/dgw/IRISLink.cgi?seg=U",
//     method: "GET",
//     headers: {
//       Cookie: [uciauth]
//     }
//   };

//   try {
//     let res: AxiosResponse = await axios.request(requestConfig);

//     //We got the set-cookies, add them to our options and create a post request with the cookies to actually get the dw xml.
//     requestConfig.url = "http://www.reg.uci.edu/dgw/IRISLink.cgi";
//     requestConfig.method = "POST";
//     requestConfig["headers"]["Content-Length"] = "33";
//     requestConfig["headers"]["Host"] = "www.reg.uci.edu";
//     requestConfig.params = {
//       SERVICE: "SCRIPTER",
//       SCRIPT: "SD2STUCON"
//     };
//     res.headers["set-cookie"].forEach(function(cookie: string) {
//       requestConfig["headers"]["Cookie"].push(cookie.split(";")[0]); //Goes through all the set-cookies of the get request and adds them to the options
//     });

//     res = await axios.request(requestConfig);

//     const studentData = {};
//     const $ = load(res.data, {});
//   } catch (e) {
//     return {
//       success: false,
//       data: e
//     };
//   }

//   return rp(options)
//     .then(response => {
//       let studentData = {};
//       let $ = cheerio.load(response.body, {
//         normalizeWhitespace: true
//       });

//       $("#formCallScript input").each(function(i) {
//         studentData[$(this)[0].attribs.name] = $(this)[0].attribs.value;
//       });

//       options[
//         "body"
//       ] = `SERVICE=SCRIPTER&REPORT=WEB31&SCRIPT=SD2GETAUD%26ContentType%3Dxml&USERID=${
//         studentData["USERID"]
//       }&USERCLASS=${
//         studentData["USERCLASS"]
//       }&BROWSER=NOT-NAV4&ACTION=REVAUDIT&AUDITTYPE=&DEGREETERM=ACTV&INTNOTES=&INPROGRESS=N&CUTOFFTERM=ACTV&REFRESHBRDG=N&AUDITID=&JSERRORCALL=SetError&NOTENUM=&NOTETEXT=&NOTEMODE=&PENDING=&INTERNAL=&RELOADSEP=TRUE&PRELOADEDPLAN=&ContentType=xml&STUID=${
//         studentData["STUID"]
//       }&SCHOOL=${studentData["SCHOOL"]}&STUSCH=${
//         studentData["STUSCH"]
//       }&DEGREE=${studentData["DEGREE"]}&STUDEG=${
//         studentData["STUDEG"]
//       }&DEBUG=OFF`;
//       options["headers"]["Content-Length"] = options["body"].length + "";

//       return rp(options);
//     })
//     .then(response => {
//       return new Promise((resolve, reject) => {
//         parseString(response.body, function(err, result) {
//           let Audit = result.Report.Audit[0];
//           if (!err) {
//             //Construct clean dw object
//             let dw = {
//               student: {
//                 name: Audit.AuditHeader[0]["$"].Stu_name,
//                 email: Audit.AuditHeader[0]["$"].Stu_email,
//                 id: Audit.AuditHeader[0]["$"].Stu_id,
//                 units: Audit.AuditHeader[0]["$"].ResApp,
//                 units_p: Audit.AuditHeader[0]["$"].ResAppInProg
//               }
//             };

//             //Add in progress classes
//             /* let in_progress = [];
//                     Audit.In_progress[0].Class.forEach((course) => {
//                         in_progress.push(course['$'].Discipline + ' ' + course['$'].Number);
//                     });
//                     dw.courses.in_progress = in_progress; */

//             let advice = {};
//             //Add courses that count towards graduation
//             //Go through all blocks
//             Audit.Block.forEach(block => {
//               //TODO: Add General Ed Requirements qq
//               if (block["$"].Req_type == "PROGRAM") {
//                 //We skip over gen ed requirements for now
//                 return;
//               }

//               //This is a block we care about so check the percent complete, if it is complete or going to be complete this quarter skip it
//               if (
//                 parseFloat(block["$"].Per_complete) == 100 ||
//                 Object.keys(block["$"]).includes("In_prog_incomplete")
//               ) {
//                 return;
//               }

//               let blockName = block["$"].Title;
//               //console.log('Scanning Valid Block:', blockName);
//               advice[blockName] = {};

//               //Woo there are some classes we have to take, go through all the rules to check them out
//               let Rules = block.Rule;
//               Rules.forEach(rule => {
//                 //If RuleType is not a course or the course has no advice courses just continue
//                 //TODO: Support Rule Groups
//                 if (
//                   rule["$"].RuleType != "Course" ||
//                   !Object.keys(rule).includes("Advice")
//                 ) {
//                   return;
//                 }

//                 let ruleName = rule["$"].Label;
//                 //console.log('Scanning Valid Rule:', ruleName);
//                 advice[blockName][ruleName] = {
//                   ClassesNeeded: parseInt(rule.Advice[0]["$"].Classes),
//                   Classes: []
//                 };

//                 //Woo we got some classes in the rule, go through all the classes and add the courses
//                 let Courses = rule.Advice[0].Course;
//                 Courses.forEach(course => {
//                   let courseName = course["$"].Disc + " " + course["$"].Num;
//                   advice[blockName][ruleName].Classes.push(courseName);
//                 });
//               });
//             });

//      console.log(auth);
//dw.advice = advice;

//             resolve(dw);
//           } else reject(err);
//         });
//       });
//     });
// }

/**
 * Returns a promise to an object of courses the provided uciauth has completed/is currently completing.
 * For more information and examples visit: TBA
 * @param {string} uciauth UCI student auth provided by login.
 * @return {promise} The promise to an object of courses the user has completed/is currently completing.
 */
//async function getDegreeWorks(uciauth: string): Promise<Result<any>> {
//   const requestConfig: AxiosRequestConfig = {
//     url: "https://www.reg.uci.edu/dgw/IRISLink.cgi?seg=U",
//     method: "GET",
//     headers: {
//       Cookie: [uciauth]
//     }
//   };

//   try {
//     let res: AxiosResponse = await axios.request(requestConfig);

//     //We got the set-cookies, add them to our options and create a post request with the cookies to actually get the dw xml.
//     requestConfig.url = "http://www.reg.uci.edu/dgw/IRISLink.cgi";
//     requestConfig.method = "POST";
//     requestConfig["headers"]["Content-Length"] = "33";
//     requestConfig["headers"]["Host"] = "www.reg.uci.edu";
//     requestConfig.params = {
//       SERVICE: "SCRIPTER",
//       SCRIPT: "SD2STUCON"
//     };
//     res.headers["set-cookie"].forEach(function(cookie: string) {
//       requestConfig["headers"]["Cookie"].push(cookie.split(";")[0]); //Goes through all the set-cookies of the get request and adds them to the options
//     });

//     res = await axios.request(requestConfig);

//     const studentData = {};
//     const $ = load(res.data, {});
//   } catch (e) {
//     return {
//       success: false,
//       data: e
//     };
//   }

//   return rp(options)
//     .then(response => {
//       let studentData = {};
//       let $ = cheerio.load(response.body, {
//         normalizeWhitespace: true
//       });

//       $("#formCallScript input").each(function(i) {
//         studentData[$(this)[0].attribs.name] = $(this)[0].attribs.value;
//       });

//       options[
//         "body"
//       ] = `SERVICE=SCRIPTER&REPORT=WEB31&SCRIPT=SD2GETAUD%26ContentType%3Dxml&USERID=${
//         studentData["USERID"]
//       }&USERCLASS=${
//         studentData["USERCLASS"]
//       }&BROWSER=NOT-NAV4&ACTION=REVAUDIT&AUDITTYPE=&DEGREETERM=ACTV&INTNOTES=&INPROGRESS=N&CUTOFFTERM=ACTV&REFRESHBRDG=N&AUDITID=&JSERRORCALL=SetError&NOTENUM=&NOTETEXT=&NOTEMODE=&PENDING=&INTERNAL=&RELOADSEP=TRUE&PRELOADEDPLAN=&ContentType=xml&STUID=${
//         studentData["STUID"]
//       }&SCHOOL=${studentData["SCHOOL"]}&STUSCH=${
//         studentData["STUSCH"]
//       }&DEGREE=${studentData["DEGREE"]}&STUDEG=${
//         studentData["STUDEG"]
//       }&DEBUG=OFF`;
//       options["headers"]["Content-Length"] = options["body"].length + "";

//       return rp(options);
//     })
//     .then(response => {
//       return new Promise((resolve, reject) => {
//         parseString(response.body, function(err, result) {
//           let Audit = result.Report.Audit[0];
//           if (!err) {
//             //Construct clean dw object
//             let dw = {
//               student: {
//                 name: Audit.AuditHeader[0]["$"].Stu_name,
//                 email: Audit.AuditHeader[0]["$"].Stu_email,
//                 id: Audit.AuditHeader[0]["$"].Stu_id,
//                 units: Audit.AuditHeader[0]["$"].ResApp,
//                 units_p: Audit.AuditHeader[0]["$"].ResAppInProg
//               }
//             };

//             //Add in progress classes
//             /* let in_progress = [];
//                     Audit.In_progress[0].Class.forEach((course) => {
//                         in_progress.push(course['$'].Discipline + ' ' + course['$'].Number);
//                     });
//                     dw.courses.in_progress = in_progress; */

//             let advice = {};
//             //Add courses that count towards graduation
//             //Go through all blocks
//             Audit.Block.forEach(block => {
//               //TODO: Add General Ed Requirements qq
//               if (block["$"].Req_type == "PROGRAM") {
//                 //We skip over gen ed requirements for now
//                 return;
//               }

//               //This is a block we care about so check the percent complete, if it is complete or going to be complete this quarter skip it
//               if (
//                 parseFloat(block["$"].Per_complete) == 100 ||
//                 Object.keys(block["$"]).includes("In_prog_incomplete")
//               ) {
//                 return;
//               }

//               let blockName = block["$"].Title;
//               //console.log('Scanning Valid Block:', blockName);
//               advice[blockName] = {};

//               //Woo there are some classes we have to take, go through all the rules to check them out
//               let Rules = block.Rule;
//               Rules.forEach(rule => {
//                 //If RuleType is not a course or the course has no advice courses just continue
//                 //TODO: Support Rule Groups
//                 if (
//                   rule["$"].RuleType != "Course" ||
//                   !Object.keys(rule).includes("Advice")
//                 ) {
//                   return;
//                 }

//                 let ruleName = rule["$"].Label;
//                 //console.log('Scanning Valid Rule:', ruleName);
//                 advice[blockName][ruleName] = {
//                   ClassesNeeded: parseInt(rule.Advice[0]["$"].Classes),
//                   Classes: []
//                 };

//                 //Woo we got some classes in the rule, go through all the classes and add the courses
//                 let Courses = rule.Advice[0].Course;
//                 Courses.forEach(course => {
//                   let courseName = course["$"].Disc + " " + course["$"].Num;
//                   advice[blockName][ruleName].Classes.push(courseName);
//                 });
//               });
//             });

//             dw.advice = advice;

//             resolve(dw);
//           } else reject(err);
//         });
//       });
//     });
// }
//}

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

//module.exports.login = login;
//module.exports.getCourses = getCourses;
//module.exports.getTransferCourses = getTransferCourses;
//module.exports.getDegreeWorks = getDegreeWorks;
