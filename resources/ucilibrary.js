var request = require('request');
var cheerio = require('cheerio');

const library = 'Ayala'; //Ayala or Langson, Langson also has a different gid
const gid = '13646';
const roomNo = '602'; //'610';
const daysToBook = [1,2,3,4,5,6,7]; //[2,4]; //1=Monday
//const date = '2017-05-16';
const startTime = '12:00pm'; //'11:00am';
const accounts = [
    /*{
        FirstName: 'Kamron',
        LastName: 'Erani',
        Email: 'kerani@uci.edu',
        AmountToBook: 4
    },
    {
        FirstName: 'Santiago',
        LastName: 'Martin',
        Email: 'santiadm@uci.edu',
        AmountToBook: 4
    },
    {
        FirstName: 'Aaron',
        LastName: 'Fortelny',
        Email: 'aforteln@uci.edu',
        AmountToBook: 4
    },
    {
        FirstName: 'Fareshte',
        LastName: 'Erani',
        Email: 'ferani@uci.edu',
        AmountToBook: 4
    },*/
    {
        FirstName: 'Stuart',
        LastName: 'Dorff',
        Email: 'sdorff@uci.edu',
        AmountToBook: 4
    },
    {
        FirstName: 'Justin',
        LastName: 'Agbayani',
        Email: 'jaagbaya@uci.edu',
        AmountToBook: 4
    },
    {
        FirstName: 'Karina',
        LastName: 'Martin',
        Email: 'karinam@uci.edu',
        AmountToBook: 4
    }
];
const bookedDays = [];

console.log("UCI Study Room Booker Started...");
console.log(`Scheduled ${library} ${roomNo} - ${startTime}`)
setInterval(() => {
    let currDate = new Date();
    let bookDate = new Date();
    bookDate.setDate(bookDate.getDate() + 7);
    
    let bookYear = bookDate.getFullYear();
    let bookMonth = bookDate.getMonth() + 1 <= 9 ? '0' + (bookDate.getMonth() + 1) : bookDate.getMonth();
    let bookDay = bookDate.getDate() <= 9 ? '0' + bookDate.getDate() : bookDate.getDate();
    let bookDateString = `${bookYear}-${bookMonth}-${bookDay}`;
    if(!bookedDays.includes(bookDateString) && daysToBook.includes(bookDate.getDay())){
        //Time to book
        reserve(library,roomNo,bookDateString,startTime,accounts);
        bookedDays.push(bookDateString);
    }
}, 60000);

//reserve(library, roomNo, date, startTime, accounts);

function reserve(library, roomNo, date, startTime, accounts) {
    startBookingSession(library, (auth) => {
        var options = {
            url: `http://spaces.lib.uci.edu/process_roombookings.php?m=calscroll&gid=${gid}&date=${date}&nocache=${Date.now()}`,
            method: 'POST',
            headers: {
                'Referer': `http://spaces.lib.uci.edu/booking/${library}`
            }
        }

        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                let rmCodes = getAvailableRoomCodes(roomNo, response.body);
                bookRooms(startTime, accounts, rmCodes, auth);
                //console.log(response.body);
            }
        });
    });
}

function startBookingSession(library, callback) {
    var options = {
        url: `http://spaces.lib.uci.edu/booking/${library}`,
        method: 'GET'
    }

    request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var auth = response.headers['set-cookie'][1].split(';')[0];
            callback(auth);
            //console.log(response.body);
        }
    });
}

function getAvailableRoomCodes(roomNo, calendar) {
    var $ = cheerio.load(calendar, {
        normalizeWhitespace: true
    });

    var available = {};
    $('.lc_rm_a').each(function (i) {
        //if (i != 0) return;
        var availableData = /.+ (\d{3}), (\d+):(\d+)(am|pm) to (\d+):(\d+)(am|pm)/.exec($(this).attr("title"));
        if (availableData[1] == roomNo) {
            available[`${availableData[2]}:${availableData[3]}${availableData[4]}`] = $(this).attr('id');
           // console.log(`${availableData[0]}: ${$(this).attr('id')}`);
        }
    });

    return available;
}

function bookRooms(startTime, accounts, codes, auth) {
    let code = codes[startTime];
    if(code === undefined) return;
    let availableCodes = [];
    Object.keys(codes).forEach((slot) => {
        availableCodes.push(codes[slot]);
    });

    accounts.forEach((account) => {
        //Get all the codes to register
        let codesToRegister = [];
        for (let c = 0; c < account.AmountToBook; c++) {
            if(!availableCodes.includes(code.toString())) break;
            codesToRegister.push(code);
            code++;
        }

        let options = {
            url: `http://spaces.lib.uci.edu/process_roombookings.php?m=booking_full`,
            method: 'POST',
            headers: {
                'Cookie': [auth],
                'Referer': `http://spaces.lib.uci.edu/booking/${library}`
            },
            form: {
                'sid': codesToRegister.join('|'),
                'tc': 'no',
                'gid': gid,
                'fname': account.FirstName,
                'lname': account.LastName,
                'email': account.Email,
                'q1': '3-5',
                'q2': 'Undergrad',
                'q3': '',
                'q4[]': 'Studying',
                'q5': '',
                'qcount': '5',
                'fid': '7102'
            }
        }
        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                let jsonResponse = JSON.parse(response.body);
                let result = jsonResponse.status == 2 ? "Success! You will receive a confirmation email shortly." : "Failed!";
                console.log(`Registering For: ${account.FirstName} ${account.LastName}: ${result}`);
            }
        });
    });

}