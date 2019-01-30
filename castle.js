const url = "https://www.relaischateaux.com/us/destinations/";
const puppeteer = require("puppeteer");
const firebase = require("firebase");
const michelin = require("./michelin").Michelin;

var Castle = function() {};

Castle.prototype.hello = function() {
  console.log("hello");
};

// Castle.prototype.getHotels2 = function(destination) {
//   try {
//     destination = destination.toLowerCase();
//     return axios.get(url + destination).then(response => {
//       const data = response.data;
//       var preJson = data.match(/var oMapOptionsdestination.+Map = (.*?)<\/script>/ms)[1];
//       var map = eval("(" + preJson + ")");
//       var markers = map.markers;
//       var json_string = JSON.stringify(markers);
//       return JSON.parse(json_string);
//     });
//   } catch (error) {
//     console.log(error);
//   }
// };

Castle.prototype.getHotels = function(destination, db) {
  try {
    destination = destination.toLowerCase();
    var hotel_url = url + destination;

    (async () => {
      db.goOnline();
      const browser = await puppeteer.launch({
        headless: true,
        timeout: 0,
        executablePath: process.env.CHROME_BIN || undefined,
        args: ['--no-sandbox', '--headless', '--disable-gpu'],
      });
      const page = await browser.newPage();

      // Get hotels of the 5th first pages
      for (let index = 1; index < 5; index++) {
        console.log("[#] Getting links... from " + hotel_url + "?page=" + index);
        await page.goto(hotel_url + "?page=" + index, { waitUntil: "load", timeout: 0 });
        await page.waitForSelector(".hotelQuickView");

        // Get hotels links only w/ restaurants
        const hotels_links = await page.evaluate(selector => {
          const hotel_quick_view_list = document.querySelectorAll(selector);
          var hotel_quick_view = [...hotel_quick_view_list];
          hotel_quick_view = hotel_quick_view.filter(hotel => hotel.innerText.includes("Hotel + Resta"));
          return hotel_quick_view.map(element => element.querySelector("h3 > a").href);
        }, "#destinationResults > div[class*=hotelQuickView]");

        console.log("[#] Done getting links\n");

        hotel_url = page.url().match(/.*\/[^?]+/);

        // Iterate through hotels of current page
        for (let i = 0; i < hotels_links.length; i++) {
          var hotel = {};
          let link = hotels_links[i];
          console.log("\n\t[#] Trying link " + link.match(/france\/.*/));

          await page.goto(link, { waitUntil: "load", timeout: 0 });

          hotel.link = link;

          // Get hotel rating
          hotel.rating = await page.evaluate(
            (selector1, selector2) => {
              if (!document.querySelector(selector1) || !document.querySelector(selector2)) return null;
              return {
                value: document.querySelector(selector1).getAttribute("data-reviewrate"),
                number: document.querySelector(selector2).innerText
              };
            },
            "#tabProperty > div > div.row.propertyDesc > div.col-2-3 > div > div.col-1-2.propertyInfo > div.propertyInfo__ratings > div.qualitelis > div.qualitelis-rating > span > div",
            "#tabProperty > div > div.row.propertyDesc > div.col-2-3 > div > div.col-1-2.propertyInfo > div.propertyInfo__ratings > div.qualitelis > div.qualitelis-reviews > div > strong"
          );

          // Get hotel name
          hotel.name = await page.evaluate(selector => {
            return document.querySelector(selector).innerText;
          }, "#tabProperty > div > div.row.hotelTabsHeader > div > div.hotelTabsHeaderTitle > h3");

          // Get hotel price
          hotel.from_price = await page.evaluate(selector => {
            const price = !document.querySelector(selector) ? null : document.querySelector(selector).innerText;
            return price;
          }, "body > div.hotelHeader > div.innerHotelHeader > div > div > span.price");

          // Get hotel rooms
          hotel.rooms = await page.evaluate(selector => {
            return document.querySelector(selector).innerText;
          }, "#tabProperty > div > div.row.hotelTabsHeader > div > div.capacity");

          // Get hotel services
          hotel.services = await page.evaluate(selector => {
            const services_node_list = document.querySelectorAll(selector);
            const services = [...services_node_list];
            return services.map(element => element.innerText);
          }, "#tabProperty > div > div.row.propertyDesc > div.row > div.col-2-3.propertyHotelActivity > div > ul > li");

          // Get restaurant link
          const restaurant_link = await page.evaluate(selector => {
            return document.querySelector(selector).href;
          }, "body > div.jsSecondNav.will-stick > ul > li > a[data-id*='isRestaurant']");
          await page.goto(restaurant_link, { waitUntil: "load", timeout: 0 });

          //Get restaurant name / services
          hotel.restaurant = await page.evaluate(
            (selector1, selector2) => {
              return {
                name: document.querySelector(selector1).innerText,
                services: document.querySelector(selector2).innerText
              };
            },
            "[id*='Restaurant'] > div > div.row.hotelTabsHeader > div:nth-child(1) > div.hotelTabsHeaderTitle > h3",
            "#restaurant-informations > div.col-1-3 > p[itemprop*='priceRange']"
          );

          hotel.restaurant.link = restaurant_link;
          await michelin.getRestaurantDetails(hotel.restaurant.name, page).then(response => {
            if (Object.entries(response).length != 0) {
              hotel.location = response.location;
              hotel.restaurant.michelin_rating = response.stars;
              saveToFirebase(hotel, db, destination);
            }
          });
        }
      }
      await page.close();
      await browser.close();
      console.log("----end----");
      db.goOffline();
    })();
  } catch (error) {
    console.log(error);
  }
};

let saveToFirebase = (hotel, db, destination) => {
  let hotelsRef = db.ref("/hotels/" + destination);
  hotelsRef
    .orderByChild("name")
    .equalTo(hotel.name)
    .once("value", snap => {
      if (!snap.exists()) {
        let newHotelRef = hotelsRef.push();
        let newHotelKey = newHotelRef.key;
        newHotelRef.set(hotel);
        console.log("[#] Success => Id: " + newHotelKey + " | Hotel: ", hotel);
      } else {
        console.log("exists!", snap.val());
      }
    });
};

exports.Castle = new Castle();
