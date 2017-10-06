let request = require('request');
let cheerio = require('cheerio');

//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

//The headers for the packet
let headers = {
    'Content-Type': 'application/x-www-form-urlencoded'
}

/**
 * Authenticates with UCI and runs the callback passing the authid cookie. Necessary to authenticate before running webreg commands.
 * ex. authenticate('peteranteater','secretpassword',function(webregUrl,callCode,auth){}); Authenticates and logs in peteranteater to webreg.
 * @param {string} ucinetid The ucinetid to authenticate with.
 * @param {string} password The ucinetid password to authenticate with.
 * @return {promise} promise The promise that resolves with webregUrl, callCode and authid json otherwise rejects with err which is the string error message
 */
function authenticate(ucinetid, password) {
    let promise = new Promise(function (resolve, reject) {
        //The options for the packet
        let options = {
            url: 'http://www.reg.uci.edu/cgi-bin/webreg-redirect.sh',
            method: 'POST',
            headers: headers,
            //proxy: 'http://localhost:8888'
        }



        request(options, function (error, response, body) {
            if (!error && response.statusCode == 302) {
                let transportLocation = response.headers['location'];
                console.log("Received Transport Location...");
                //GET transport location
                options = {
                    url: transportLocation,
                    method: 'GET',
                    headers: headers
                }

                request(options, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        let authenticationPortal = /url=(.*)">/.exec(body)[1]; //Gets the auth portal url from the body.
                        let returnUrl = /return_url=(.*\d)&/.exec(authenticationPortal)[1]; //Extracts the return url from the body.
                        let callCode = /call=(\d+)/.exec(authenticationPortal)[1]; //Extracts the call code from the body.
                        let webregUrl = /(.*)?/.exec(returnUrl)[1];

                        console.log("Received Authentication Portal...");
                        //GET transport location
                        options = {
                            url: authenticationPortal,
                            method: 'POST',
                            headers: headers,
                            form: {
                                'referer': transportLocation,
                                'return_url': returnUrl,
                                'info_text': '',
                                'info_url': '',
                                'submit_type': '',
                                'ucinetid': ucinetid,
                                'password': password,
                                'login_button': 'Login'
                            }
                        }

                        request(options, function (error, response, body) {
                            if (!error && response.statusCode == 200) {
                                //GET transport location
                                let auth = response.headers['set-cookie'][0].split(';')[0];
                                console.log("Authenticated With UCI...");
                                options = {
                                    url: returnUrl,
                                    method: 'GET',
                                    headers: headers,
                                }
                                options['headers']['Cookie'] = [auth];

                                request(options, function (error, response, body) {
                                    if (!error && response.statusCode == 200) {

                                        if (hasError(body)) {
                                            let $ = cheerio.load(body, {
                                                normalizeWhitespace: true
                                            });

                                            let errorMsg = $('div.WebRegErrorMsg');
                                            let errorMsgText = errorMsg.text().trim();
                                            reject(errorMsgText);
                                        }
                                        else {
                                            resolve({
                                                webregUrl,
                                                callCode,
                                                auth
                                            })
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    });

    return promise;
}

/**
 * Navigates the webreg menu. Webreg requires navigation before performing actions such as add/drop courses.
 * It is necessary to keep track of what page you are on and what page you want to go to (mode). Make sure to go to exit to log out.
 * The following is a list of all the page names:
 * enrollQtrMenu = The main menu users see when logging into webreg. This is your default page.
 * enrollmentMenu = The normal enrollment page, this is where you can add courses normally.
 * waitlistMenu = The waitlist enrollment page, this is where you can add courses to the waitlist.
 * exit = The logout button, go here if you want to log the user out.
 * @param {string} page The current page the user is on.
 * @param {string} mode The page to navigate to.
 * @param {string} webregUrl The authenticated webregUrl. (Provided by authenticate callback)
 * @param {string} callCode The authenticated callCode. (Provided by authenticate callback)
 * @param {string} auth The user's authid. (Provided by authenticate callback)
 * @param {*} callback Callback run once navigation complete. (Optional)
 */
function navigateMenu(page, mode, webregUrl, callCode, auth, callback) {
    options = {
        url: webregUrl,
        method: 'POST',
        headers: headers,
        form: {
            'page': page,
            'mode': mode,
            'call': callCode
        }
    }
    options['headers']['Cookie'] = [auth];

    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            let message = null
            if (hasMessage(body)) {
                let $ = cheerio.load(body, {
                    normalizeWhitespace: true
                });

                let infoMsg = $('div.WebRegInfoMsg');
                message = infoMsg.text().trim();
            }
            if (callback != null) { callback(message); }
        }
        else{
            console.log(error);
        }
    });
}

/**
 * Attempts to add the course specified by courseCode.
 * @param {string} page The page to send the add request to [enrollment | waitlist]Menu.
 * @param {string} courseCode The course code to attempt to add. 
 * @param {string} webregUrl The authenticated webregUrl. (Provided by authenticate callback)
 * @param {string} callCode The authenticated callCode. (Provided by authenticate callback)
 * @param {string} auth The user's authid. (Provided by authenticate callback)
 * @return {promise} Promise that resolves in true if added else false and an error message. 
 */
function addCourse(page, courseCode, webregUrl, callCode, auth) {
    let deferred = Promise.defer();

    //The options for the packet
    let options = {
        url: webregUrl,
        method: 'POST',
        headers: headers,
        form: {
            'page': page,
            'call': callCode,
            'button': 'Send Request',
            'mode': 'add',
            'courseCode': courseCode
        }
    }
    options['headers']['Cookie'] = [auth];

    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            if (hasError(body)) {
                let $ = cheerio.load(body, {
                    normalizeWhitespace: true
                });

                let errorMsg = $('div.WebRegErrorMsg');
                let errorMsgText = errorMsg.text();
                deferred.resolve({
                    success: false,
                    courseCode: courseCode,
                    message: errorMsgText
                }); //Did not add, error message provided
            }
            else {
                deferred.resolve({
                    success: true,
                    courseCode: courseCode
                }); //Added, no error message provided
            }
        }
    });

    return deferred.promise;
}


/**
 * Checks if webreg response shows an error message. Used to check if a class failed being added.
 * @param {string} response The response webreg gives when adding a course. 
 * @return {boolean} Whether or not there was an error in the response (true if error, else false).
 */
function hasError(response) {
    return response.includes('WebRegErrorMsg');
}

/**
 * Checks if webreg response shows an info message. Used to check for informative messages (You have been logged out)
 * @param {string} response The response webreg gives when performing an action.
 * @return {boolean} Whether or not there was an info message in the response (true if exists, else false).
 */
function hasMessage(response) {
    return response.includes('WebRegInfoMsg');
}

module.exports.authenticate = authenticate;
module.exports.navigateMenu = navigateMenu;
module.exports.addCourse = addCourse;