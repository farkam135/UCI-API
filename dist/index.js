"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UCI = {
    //SOC: require("./resources/ucisoc"),
    //WEBREG: require("./resources/uciwebreg"),
    //STUDENT: require("./resources/ucistudent"),
    PROFS: require("./resources/uciprofs")
};
exports.UCI.PROFS.refreshProfs().then((a) => {
    console.log(a);
});
//test.SOC.init()
//.then(() => {
//  return test.SOC.loadDept('COMPSCI');
//})
//.then(() => {
//  console.log(JSON.stringify(test.SOC.getCourseDetails(['COMPSCI 122B'])));
//})
//UCI.STUDENT.login("kerani", "")
//  .then((auth: string) => {
//    return UCI.STUDENT.getCourses(auth);
//  })
//  .then((courses: string[]) => {
//    console.log(JSON.stringify(courses));
//  });
//# sourceMappingURL=index.js.map