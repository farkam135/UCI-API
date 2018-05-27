import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { load } from "cheerio";
import {
  SearchParams,
  Course,
  href,
  CourseOffering,
  SelectElement,
  CatalogueEntry,
  Catalogue,
  PreReqs,
  SOC,
  SOCEntry
} from "../interfaces";

const DEPTS: SelectElement[] = [];
const YEARTERMS: SelectElement[] = [];

const NO_CAT_DEPTS = ["EHS", "MED HUM", "OB/GYN", "PLASTIC", "PM&R"]; //The departments that aren't on the catalogue for some reason.
const OVERWRITE_CAT_DEPTS: { [key: string]: string } = {
  "GLBL ME": "glblme"
}; //The catalogue departments that don't follow the standard rule of \s,/,& = _

const SOC: SOC = {}; //The SOC "cache", populated using the "loadDept" function which fills in the SOC object with all the information related to a course.

/**
 * Initializes the SOC by loading the current WebSoc and pulling the current department codes.
 * @return {Promise<void>} Promise that resolves if successfully initialized.
 */
export async function init(): Promise<void> {
  const webSocRequest: AxiosRequestConfig = {
    url: "https://www.reg.uci.edu/perl/WebSoc",
    method: "GET"
  };

  const webSoc = await axios.request(webSocRequest);

  const $ = load(webSoc.data, {
    normalizeWhitespace: true
  });

  $("select[name='YearTerm'] option").each((_, option) => {
    if (option.attribs.selected) {
      YEARTERMS.unshift({
        name: $(option).html(),
        value: option.attribs.value
      });

      return;
    }

    YEARTERMS.push({
      name: $(option).html(),
      value: option.attribs.value
    });
  });

  const deptRegEx = /<option value="(.+)">(\1.+\..+)<\/option>/g;
  let newDept = null;

  while ((newDept = deptRegEx.exec(webSoc.data))) {
    DEPTS.push({
      name: newDept[2].replace("&amp;", "&"),
      value: newDept[1].replace("&amp;", "&")
    });
  }
}

/**
 * Searches the UCI schedule of classes and returns back a promise that resolves to an object with the results.
 * Note: In order to use searchSchedule init() must have been successfully invoked.
 * For more information on the resulting object, format and examples, visit:
 * @param {SearchParams} search The object which holds the search criteria. Keys: Breadth, Dept, CourseNum, Division, ClassType, FullCourses
 * @return {Promise<Course[]>} The promise that will resolve to the courses array.
 */
export async function searchSchedule(search: SearchParams): Promise<Course[]> {
  const options: AxiosRequestConfig = {
    url: "https://www.reg.uci.edu/perl/WebSoc",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    params: {
      YearTerm: search.YearTerm || YEARTERMS[0].value,
      Breadth: search.Breadth || "ANY",
      Dept: search.Dept || "ALL",
      CourseNum: search.CourseNum,
      Division: search.Division || "ANY",
      CourseCodes: search.CourseCodes,
      InstrName: search.InstrName,
      CourseTitle: search.CourseTitle,
      ClassType: search.ClassType || "ALL",
      Units: search.Units,
      Days: search.Days,
      StartTime: search.StartTime,
      EndTime: search.EndTime,
      MaxCap: search.MaxCap,
      FullCourses: search.FullCourses || "ANY",
      FontSize: "100",
      CancelledCourses: "Exclude",
      Bldg: search.Bldg,
      Room: search.Room,
      Submit: "Display Web Results"
    }
  };

  const searchResults = await axios.request(options);
  return parseSOC(searchResults.data);
}

/**
 * Gets a course's details, basically the same information returned from the schedule of classes except without the volatile columns such as
 * the ENR, WL, REQ columns. This function returns information from the local SOC "cache" so in order to get back any results the loadDept()
 * function had to be invoked beforehand with the department of the course you are getting details for (e.g. If you wanted to use
 * getCourseDetails('COMPSCI 121') you would only get back undefined unless you ran loadDept('COMPSCI') beforehand). Since this function
 * is using the local SOC calls to getCourseDetails does not make any additional requests to UCI.
 * @param {Array[string]} courses An array of course's full names you want to get details for (i.e. ['COMPSCI 121'])
 * @return {SOC} The promise that will resolve to an object with the keys being the course name and the value being the course object.
 */
export function getCourseDetails(courses: string[]): SOC {
  const courseDetails: SOC = {};
  for (const course of courses) {
    courseDetails[course] = SOC[course];
  }
  return courseDetails;
}

/**
 * Internal function called from loadDept.
 * Used to get a department's catalogue from catalogue.uci.edu, which we use to get the full course title as well as a course description
 * and add that to our local SOC.
 * @param {string} dept The department code (i.e. 'COMPSCI')
 * @return {Promise<Catalogue>} A promise that resolves to an object that represents courses with the keys {fullName, description}
 */
async function getCatalogueByDept(dept: string): Promise<Catalogue> {
  let catalogueDeptName = dept.toLowerCase().replace(/\s|\/|&/g, "_");

  if (NO_CAT_DEPTS.includes(dept)) {
    return {};
  } else if (OVERWRITE_CAT_DEPTS[dept] !== undefined) {
    catalogueDeptName = OVERWRITE_CAT_DEPTS[dept];
  }

  const catalogueRequest: AxiosRequestConfig = {
    url: `http://catalogue.uci.edu/allcourses/${catalogueDeptName}`
  };

  const catalogue = await axios.request(catalogueRequest);

  const $ = load(catalogue.data, {
    normalizeWhitespace: true
  });

  const courses: Catalogue = {};
  $("div.courseblock").each(function(i) {
    //if (i === 0) return; //The first tr is the headers, so ignore
    let courseBlock = $(this).children();
    let title = $(courseBlock[0])
      .text()
      .split(". "); //Splits the catalogue title into an array ['DEPT NUM', 'Full Name', 'Units']
    let courseDesc = $($(courseBlock[1]).children()[0]).text();

    courses[title[0]] = {
      fullName: title[1],
      description: courseDesc
    };
  });

  return courses;
}

/**
 * Internal function called from loadDept.
 * Used to get a department's checked prereqs from reg.uci.edu, which we use to find out what other courses are needed to register for a course
 * and is added to our local SOC.
 * For more information visit:
 * @param {string} dept The department code (i.e. 'COMPSCI')
 * @return {promise} A promise that resolves to an object with the key being the course name (i.e. 'COMPSCI 121') and the value being a prereq array.
 */
async function getPrereqsByDept(dept: string): Promise<PreReqs> {
  const prereqsRequest: AxiosRequestConfig = {
    url: "https://www.reg.uci.edu/cob/prrqcgi",
    method: "GET",
    params: {
      dept: dept.toUpperCase(),
      action: "view_all"
    },
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  };

  const preReqs = await axios.request(prereqsRequest);
  const $ = load(preReqs.data, {
    normalizeWhitespace: true
  });

  const courses: PreReqs = {};
  console.log($(".error_message").text());

  $("table[align=center] tr").each(function(i) {
    if (i === 0) return; //The first tr is the headers, so ignore
    let tableData = $(this).children();
    let course = $(tableData[0])
      .text()
      .trim();
    let prereqText = $(tableData[2]).html();

    if (!prereqText) return;
    if (!course.length) return;
    courses[course] = [];
    prereqText.split("<br><b>AND</b><br>").forEach(prereq => {
      const optCourses: string[] = [];
      prereq.split("<b>OR</b>").forEach(optPrereq => {
        if (optPrereq.includes("recommended")) return;

        optPrereq = optPrereq
          .replace(/<b>.*?<\/b>/g, "")
          .replace("&amp;", "&")
          .trim();
        if (!optPrereq.length) return;
        optCourses.push(optPrereq);
      });
      if (!optCourses.length) return;
      courses[course].push(optCourses);
    });
  });

  return courses;
}

/**
 * Internal function called from loadAll.
 * Used to get information on a specific dept to store in the local SOC. Using searchSchedule, getPrereqsByDept and getCatalogueByDept, calling
 * this function will populate the local SOC with information from multiple UCI resources so that it can later be accessed with getCourseDetails.
 * @param {string} dept The department code to load into the local SOC (i.e. 'COMPSCI')
 * @return {promise} A promise that resolves when the course has been successfully loaded.
 */
export async function loadDept(dept: string) {
  console.log(`Loading Department: ${dept}`);

  const [catalogue, preReqs, courses] = await Promise.all([
    getCatalogueByDept(dept),
    getPrereqsByDept(dept),
    searchSchedule({ Dept: dept })
  ]);

  Object.keys(catalogue).forEach(course => {
    SOC[course] = catalogue[course];
  });

  //Go through all the courses of a search result and set them in the local SOC with their key being dept + ' ' + num (e.g. COMPSCI 122B)
  for (const course of courses) {
    const courseName = `${course.dept} ${course.num}`;

    const offeringCodes: string[] = [];
    for (const offering of course.offerings) {
      offeringCodes.push(offering.Code);
    }

    course.offeringCodes = offeringCodes;

    if (!SOC[courseName]) {
      SOC[courseName] = {};
    }

    SOC[courseName] = Object.assign(SOC[courseName], course);
  }

  //Once we set all the courses being offered this quarter for the dept, we load up the prereqs and set those as well
  Object.keys(preReqs).forEach(courseName => {
    if (!SOC[courseName]) {
      SOC[courseName] = {};
    }

    SOC[courseName].prereqs = preReqs[courseName];
  });
}

/**
 * Populates the local SOC with information about courses. Throttles requests to loadDept ensuring that it waits for a department to
 * be completely loaded before attempting to load another, this is as a courtesy to UCI to ensure not all the requests are sent at the same time.
 * Note: Since loadAll uses DEPTS, this function can only be invoked after init() successfully runs.
 * @return {Promise<void>} A promise that resolves when the local SOC is completely populated.
 */
export async function loadAll() {
  if (DEPTS.length === 0) {
    throw new Error(
      "DEPTS not populated, please run init() before attempting to load the local SOC."
    );
  }

  for (const { value: deptName } of DEPTS) {
    await loadDept(deptName);
  }

  console.log("SOC Loaded");
}

/**
 * Parses the UCI SOC results html. For more information visit: https://github.com/farkam135/UCI-API/wiki/Parsers
 * @param {string} html The response from searching the UCI SOC (https://www.reg.uci.edu/perl/WebSoc)
 * @return The JSON representation of the UCI SOC search. For examples visit: https://github.com/farkam135/UCI-API/wiki/Parsers
 */
function parseSOC(html: string): Course[] {
  const $ = load(html, {
    normalizeWhitespace: true
  });

  const courses: Course[] = [];
  let currentCourse: Course = { dept: "", num: "", name: "", offerings: [] };
  let currentCourseHeaders: string[] = [];

  $("div.course-list tr").each((_, tr) => {
    //Course title
    if ($(tr).attr("bgcolor") === "#fff0ff") {
      //console.log($($(tr).children()[0]).children().length);
      let courseTitleTd = $($(tr).children()[0]).html();
      let courseTitleArray = /\s?(.+)\s(.+)\s<.+<b>(.+)<\/b>/.exec(
        courseTitleTd
      ); //Splits up the dept, num and name from the courseTitleTd html

      currentCourse.dept = courseTitleArray[1]
        .toUpperCase()
        .replace(/&amp;/gi, "&");
      currentCourse.num = courseTitleArray[2];
      currentCourse.name = courseTitleArray[3].replace(/&amp;/gi, "&");
    }
    //Course headers
    else if ($(tr).attr("bgcolor") === "#E7E7E7") {
      $(tr)
        .children()
        .each((_, th) => {
          currentCourseHeaders.push($(th).text());
        });
    }
    //Course offerings
    else if ($(tr).attr("valign") === "top") {
      const newOffering: CourseOffering | any = {};

      $(tr)
        .children()
        .each((i, td) => {
          let data: string | string[] | href;

          //If we are currently on Instructor then we have to check for multiple instructors and set it as an array rather than just text
          if (currentCourseHeaders[i] === "Instructor") {
            data = $(td)
              .html()
              .replace("&apos;", "'")
              .split("<br>")
              .filter(instructor => {
                return instructor !== "";
              });
          }
          //Check if the td has children and the child is an a tag, if so it's a hyperlink so set the value to both the text and the link.
          else if (
            $(td).children().length > 0 &&
            $($(td).children()[0]).is("a")
          ) {
            let tdChild = $($(td).children()[0]);
            data = {
              value: tdChild.text(),
              href: tdChild.attr("href")
            };
          } else {
            data = $(td).text();
          }

          newOffering[currentCourseHeaders[i]] = data;
        });

      currentCourse.offerings.push(newOffering);
    }
    //End of course offerings, add to courses
    else if (
      ($(tr).attr("class") === "blue-bar" &&
        $(tr).attr("bgcolor") === "navy") ||
      $(tr).attr("class") === "college-title"
    ) {
      if (currentCourse.offerings.length > 0) {
        courses.push(currentCourse);
        currentCourse = { dept: "", num: "", name: "", offerings: [] };
        currentCourseHeaders = [];
      }
    }
  });

  return courses;
}
