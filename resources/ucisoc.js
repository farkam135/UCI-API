let cheerio = require("cheerio");
let rp = require("request-promise");

let YEAR_TERM = undefined;
const DEPTS = [];

const NO_CAT_DEPTS = ['EHS', 'MED HUM', 'OB/GYN', 'PLASTIC', 'PM&R']; //The departments that aren't on the catalogue for some reason.
const OVERWRITE_CAT_DEPTS = {
  'GLBL ME': 'glblme'
}; //The catalogue departments that don't follow the standard rule of \s,/,& = _
//const CACHE_KEYS = ['Code']; //The columns to add to the SOC cache, for now it's just Code


let SOC = {}; //The SOC "cache", populated using the "loadDept" function which fills in the SOC object with all the information related to a course.

/**
 * Initializes the SOC by loading the current WebSoc and pulling the current YEAR TERM as well as all the department codes.
 * @return {promise} Promise that resolves if successfully initialized.
 */
function init() {
  let yearTermRegEx = /<option value="(\d{4}-\d{2})".+selected/g;
  let deptRegEx = /<option value="(.+)">(\1.+\..+)<\/option>/g;

  return rp("https://www.reg.uci.edu/perl/WebSoc").then((response) => {
    YEAR_TERM = yearTermRegEx.exec(response)[1];

    //Go through all the departments and set their tag (code + name) as well as just their code
    let newDept = null;
    while (newDept = deptRegEx.exec(response)) {
      DEPTS.push({
        name: newDept[2].replace('&amp;', '&'),
        value: newDept[1].replace('&amp;', '&')
      })
    }

    return Promise.resolve();
  }).catch((err => {
    return Promise.reject(err);
  }))
}

/**
 * Searches the UCI schedule of classes and returns back a promise that resolves to an object with the results.
 * Note: In order to use searchSchedule init() must have been successfully invoked.
 * For more information on the resulting object, format and examples, visit: 
 * @param {object} search The object which holds the search criteria. Keys: Breadth, Dept, CourseNum, Division, ClassType, FullCourses
 * @return {promise} The promise that will resolve to the courses array.
 */
function searchSchedule(search) {
  if (YEAR_TERM === undefined) {
    return Promise.reject('YEAR_TERM not loaded, please run init() before attempting to access SOC');
  }

  let options = {
    url: "https://www.reg.uci.edu/perl/WebSoc",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    qs: {
      YearTerm: YEAR_TERM,
      Breadth: search.Breadth || "ANY",
      Dept: search.Dept || "ALL",
      CourseCodes: search.CourseCodes,
      CourseNum: search.CourseNum,
      Division: search.Division || "ANY",
      ClassType: search.ClassType || "ALL",
      FullCourses: search.FullCourses || "ANY",
      FontSize: "100",
      CancelledCourses: "Exclude",
      Submit: "Display Web Results"
    },
    resolveWithFullResponse: true
  };

  return rp(options).then(response => {
    return parseSOC(response.body);
  })
    .catch((err) => {
      return Promise.reject(err);
    })
}

/**
 * Gets a course's details, basically the same information returned from the schedule of classes except without the volatile columns such as
 * the ENR, WL, REQ columns. This function returns information from the local SOC "cache" so in order to get back any results the loadDept() 
 * function had to be invoked beforehand with the department of the course you are getting details for (e.g. If you wanted to use 
 * getCourseDetails('COMPSCI 121') you would only get back undefined unless you ran loadDept('COMPSCI') beforehand). Since this function
 * is using the local SOC calls to getCourseDetails does not make any additional requests to UCI.
 * @param {Array[string]} courses An array of course's full names you want to get details for (i.e. ['COMPSCI 121'])
 * @return {promise} The promise that will resolve to an object with the keys being the course name and the value being the course object.
 */
function getCourseDetails(courses) {
  let courseDetails = {};
  courses.forEach((name) => {
    courseDetails[name] = SOC[name];
  });
  return courseDetails;
}

/**
 * Internal function called from loadDept.
 * Used to get a department's catalogue from catalogue.uci.edu, which we use to get the full course title as well as a course description
 * and add that to our local SOC.
 * @param {string} Dept The department code (i.e. 'COMPSCI')
 * @return {promise} A promise that resolves to an array of objects that represent courses with the keys {fullName, description} 
 */
function getCatalogueByDept(Dept) {
  let catalogueDeptName = Dept.toLowerCase().replace(/\s|\/|&/g, '_');

  if (NO_CAT_DEPTS.includes(Dept)) {
    return {};
  }
  else if (OVERWRITE_CAT_DEPTS[Dept] !== undefined) {
    catalogueDeptName = OVERWRITE_CAT_DEPTS[Dept];
  }

  let options = {
    url: `http://catalogue.uci.edu/allcourses/${catalogueDeptName}`,
    transform: (body) => {
      return cheerio.load(body, {
        normalizeWhitespace: true
      });
    }
  };

  return rp(options).then($ => {
    let courses = {};
    $("div.courseblock").each(function (i) {
      //if (i === 0) return; //The first tr is the headers, so ignore
      let courseBlock = $(this).children();
      let title = $(courseBlock[0]).text().split('. '); //Splits the catalogue title into an array ['DEPT NUM', 'Full Name', 'Units']
      let courseDesc = $($(courseBlock[1]).children()[0]).text();

      courses[title[0]] = {
        fullName: title[1],
        description: courseDesc
      };
    });

    return courses;
  })
    .catch((err) => {
      return Promise.reject(err);
    });
}

/**
 * Internal function called from loadDept.
 * Used to get a department's checked prereqs from reg.uci.edu, which we use to find out what other courses are needed to register for a course
 * and is added to our local SOC.
 * For more information visit: 
 * @param {string} Dept The department code (i.e. 'COMPSCI')
 * @return {promise} A promise that resolves to an object with the key being the course name (i.e. 'COMPSCI 121') and the value being a prereq array. 
 */
function getPrereqsByDept(Dept) {
  if (YEAR_TERM === undefined) {
    return Promise.reject('YEAR_TERM not loaded, please run load() before attempting to access SOC');
  }

  let options = {
    url: "https://www.reg.uci.edu/cob/prrqcgi",
    method: "GET",
    qs: {
      dept: Dept.toUpperCase(),
      action: "view_all",
      term: YEAR_TERM.replace('-', '')
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    resolveWithFullResponse: true,
    transform: (body) => {
      return cheerio.load(body, {
        normalizeWhitespace: true
      });
    }
  };

  return rp(options).then($ => {
    let courses = {};
    $("table[align=center] tr").each(function (i) {
      if (i === 0) return; //The first tr is the headers, so ignore
      let tableData = $(this).children();
      let course = $(tableData[0]).text().trim();
      let prereqText = $(tableData[2]).text().replace('UPPER DIVISION STANDING ONLY', '');

      if (course.length === 0) return;
      courses[course] = [];
      prereqText.split("AND").forEach(prereq => {
        if (prereq.length === 1) return;

        let optCourses = [];
        if (prereq.trim()[0] == "(") prereq = /\s*\(?(.+)\)/g.exec(prereq)[1];
        prereq.split("OR").forEach(optPrereq => {
          if (optPrereq.includes("recommended")) return;
          if (optPrereq.includes("(")) {
            optCourses.push(/(\w.+) \(/g.exec(optPrereq)[1].trim());
          } else {
            optCourses.push(optPrereq.trim());
          }
        });
        if (optCourses.length == 0) return;
        courses[course].push(optCourses);
      });
    });

    return courses
  })
    .catch((err) => {
      return Promise.reject(err);
    });
}

/**
 * Internal function called from loadAll.
 * Used to get information on a specific dept to store in the local SOC. Using searchSchedule, getPrereqsByDept and getCatalogueByDept, calling
 * this function will populate the local SOC with information from multiple UCI resources so that it can later be accessed with getCourseDetails.
 * @param {string} dept The department code to load into the local SOC (i.e. 'COMPSCI')
 * @return {promise} A promise that resolves when the course has been successfully loaded.
 */
function loadDept(dept) {
  console.log(`Loading Department: ${dept}`);
  return getCatalogueByDept(dept)
    .then((res) => {
      Object.keys(res).forEach((course) => {
        SOC[course] = res[course];
        //console.log(SOC[course]);
      });

      return searchSchedule({ Dept: dept });
    })
    .then((courses) => {
      //Go through all the courses of a search result and set them in the local SOC with their key being dept + ' ' + num (e.g. COMPSCI 122B)
      courses.forEach((course) => {
        let courseName = `${course.dept} ${course.num}`

        //Go through all the course offerings and add their course code a offerings array and reset it.
        let offerings = [];
        course.offerings.forEach((offering, i) => {
          offerings.push(offering.Code);
        });

        course.offerings = offerings;

        if(SOC[courseName] === undefined){
          SOC[courseName] = {};
        }
        SOC[courseName] = Object.assign(SOC[courseName], course);
      });

      //Once we set all the courses being offered this quarter for the dept, we load up the prereqs and set those as well
      return getPrereqsByDept(dept);
    })
    .then((res) => {
      Object.keys(res).forEach((course) => {
        if(SOC[course] === undefined){
          SOC[course] = {};
        }

        SOC[course].prereqs = res[course];
      });

      return Promise.resolve();
    })
    .catch((err) => {
      console.error(err);
    })
}

/**
 * Populates the local SOC with information about courses. Throttles requests to loadDept ensuring that it waits for a department to 
 * be completely loaded before attempting to load another, this is as a courtesy to UCI to ensure not all the requests are sent at the same time.
 * Note: Since loadAll uses DEPTS, this function can only be invoked after init() successfully runs.
 * @return {promise} A promise that resolves when the local SOC is completely populated.
 */
function loadAll() {
  if (DEPTS.length === 0) {
    return Promise.reject('DEPTS not populated, please run init() before attempting to load the local SOC.');
  }
  return new Promise((resolve, reject) => {
    let i = 0;
    let loadDeptThrottle = () => {
      return loadDept(DEPTS[i].value)
        .then(() => {
          i++;
          if (i < DEPTS.length) {
            return loadDeptThrottle();
          }
          return Promise.resolve();
        })
    };

    loadDeptThrottle()
      .then(resolve);
  })
    .then(() => {
      console.log('Loaded SOC');
      //fs.writeFile('SOC.json',JSON.stringify(SOC));
    })
}

/**
 * Parses the UCI SOC results html. For more information visit: https://github.com/farkam135/UCI-API/wiki/Parsers
 * @param {string} html The response from searching the UCI SOC (https://www.reg.uci.edu/perl/WebSoc)
 * @return The JSON representation of the UCI SOC search. For examples visit: https://github.com/farkam135/UCI-API/wiki/Parsers
 */
function parseSOC(html) {
  let $ = cheerio.load(html, {
    normalizeWhitespace: true
  });

  let courses = [];
  let currentCourse = { offerings: [] };
  let currentCourseHeaders = [];

  $("div.course-list tr").each((_, tr) => {
    //Course title
    if ($(tr).attr('bgcolor') === '#fff0ff') {
      //console.log($($(tr).children()[0]).children().length);
      let courseTitleTd = $($(tr).children()[0]).html();
      let courseTitleArray = /\s?(.+)\s(.+)\s<.+<b>(.+)<\/b>/.exec(courseTitleTd); //Splits up the dept, num and name from the courseTitleTd html

      currentCourse.dept = courseTitleArray[1].toUpperCase();
      currentCourse.num = courseTitleArray[2];
      currentCourse.name = courseTitleArray[3];
    }
    //Course headers
    else if ($(tr).attr('bgcolor') === '#E7E7E7') {
      $(tr).children().each((_, th) => {
        currentCourseHeaders.push($(th).text());
      });
    }
    //Course offerings
    else if ($(tr).attr('valign') === 'top') {
      let newOffering = {};
      $(tr).children().each((i, td) => {
        let data = $(td).text();

        //If we are currently on Instructor then we have to check for multiple instructors and set it as an array rather than just text
        if (currentCourseHeaders[i] === 'Instructor') {
          data = $(td).html().split('<br>').filter((instructor) => {
            return instructor !== '';
          });
        }
        //Check if the td has children and the child is an a tag, if so it's a hyperlink so set the value to both the text and the link. 
        else if ($(td).children().length > 0 && $($(td).children()[0]).is('a')) {
          let tdChild = $($(td).children()[0]);
          data = {
            value: tdChild.text(),
            href: tdChild.attr('href')
          }
        }

        newOffering[currentCourseHeaders[i]] = data;
      });

      currentCourse.offerings.push(newOffering);
    }
    //End of course offerings, add to courses
    else if (($(tr).attr('class') === 'blue-bar' && $(tr).attr('bgcolor') === 'navy') || $(tr).attr('class') === 'college-title') {
      if (currentCourse.offerings.length > 0) {
        courses.push(currentCourse);
        currentCourse = { offerings: [] };
        currentCourseHeaders = [];
      }
    }
  });

  return courses;
}

module.exports.init = init;
module.exports.loadAll = loadAll;
module.exports.loadDept = loadDept;
module.exports.searchSchedule = searchSchedule;
module.exports.getCourseDetails = getCourseDetails;
