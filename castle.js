const url = "https://www.relaischateaux.com/fr/destinations/";
const puppeteer = require("puppeteer");
const firebase = require("firebase");
const michelin = require("./michelin").Michelin;
const crypto = require("crypto");

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
        args: ["--no-sandbox", "--headless", "--disable-gpu"]
      });

      // Get hotels of the 5th first pages
      for (let index = 1; index < 20; index++) {
        const pageLinks = await browser.newPage();
        console.log("[#] Getting links... from " + hotel_url + "?page=" + index);
        await pageLinks.goto(hotel_url + "?page=" + index, { waitUntil: "load", timeout: 0 });
        await pageLinks.waitForSelector(".hotelQuickView");

        // Get hotels links only w/ restaurants
        const hotels_links = await pageLinks.evaluate(selector => {
          const hotel_quick_view_list = document.querySelectorAll(selector);
          var hotel_quick_view = [...hotel_quick_view_list];
          hotel_quick_view = hotel_quick_view.filter(hotel => hotel.innerText.match(/h(o|ô)tel \+ resta/i));
          return hotel_quick_view.map(element => element.querySelector("h3 > a").href);
        }, "#destinationResults > div[class*=hotelQuickView]");


        console.log("[#] Done getting links\n");

        hotel_url = pageLinks.url().match(/.*\/[^?]+/);

        // Iterate through hotels of current page
        for (let i = 0; i < hotels_links.length; i++) {
          const page = await browser.newPage();
          var hotel = {};
          let link = hotels_links[i];
          console.log("\n\t[#] Trying link " + link.match(/france\/.*/));

          await page.goto(link, { waitUntil: "load", timeout: 0 });

          await page.waitForSelector("#tabProperty > div > div.row.hotelTabsHeader > div > div.hotelTabsHeaderTitle > h3");

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

          // Get hotel image media
          hotel.media = await page.evaluate(selector => {
            const media = document.querySelector(selector) ? document.querySelector(selector).src : null;
            return media;
          }, "body > div.hotelHeader > div.innerHotelHeader > figure > picture > img");

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

          // Get hotel details
          const details_link = await page.evaluate(selector => {
            return document.querySelector(selector).href;
          }, "body > div.jsSecondNav.will-stick > ul > li> a[data-id*='isGoodToKnow']");

          // Get restaurant link
          const restaurant_link = await page.evaluate(selector => {
            return document.querySelector(selector).href;
          }, "body > div.jsSecondNav.will-stick > ul > li > a[data-id*='isRestaurant']");

          await page.goto(details_link, { waitUntil: "networkidle2", timeout: 0 });

          if (hotel.location = await getHotelLocation(page)) {
            await page.goto(restaurant_link, { waitUntil: "networkidle2", timeout: 0 });
            await page.waitForSelector("[id*='Restaurant'] > div > div.row.hotelTabsHeader > div:nth-child(1) > div.hotelTabsHeaderTitle > h3");

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

            hotel.id = await ID(hotel.name, destination);

            hotel.restaurant.link = restaurant_link;
            await michelin.getRestaurantDetails(hotel.restaurant.name, page).then(response => {
              if (Object.entries(response).length != 0 && response.stars != null) {
                hotel.restaurant.michelin_rating = response.stars;
                hotel.restaurant.michelin_url = response.michelin_url;
                saveToFirebase(hotel, db, destination);
              }
            });
          }
          await page.close();
        }
        await pageLinks.close();
      }
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

let updateDispoHotelFirebase = async (first, second, ref, id) => {
  var query = ref.orderByChild('id').equalTo(id);
  query.once("child_added", function(snapshot) {
    snapshot.ref.update({disponibilites: {first: first, second:second}})
    console.log(`${id} dispo updated!`);
  });
}

Castle.prototype.updateDispoElement = (destination, db) => {
  db.goOnline();
    var ref = db.ref(`/hotels/${destination}`);
    
    var hotel_array = [];
  ref.on(
    "value", async function (snapshotHotel) {
      snapshotHotel.forEach(snaphost => {
        var obj = snaphost.val();
        
        hotel_array.push({
          link: obj.link,
          id: obj.id
        })
      }
      )
      await getHotelDispo(hotel_array, ref);
      db.goOffline();
    }
  )
}

let ID = async (name, destination) => {
  const id = crypto
    .createHmac("sha256", destination)
    .update(name)
    .digest("hex");
  return id.substr(2, 9);
};

let getHotelDispo = async (hotels, ref) => {
  const browser = await puppeteer.launch({
    headless: true,
    timeout: 0,
    executablePath: process.env.CHROME_BIN || undefined,
    args: ["--no-sandbox", "--headless", "--disable-gpu"]
  });
  const page = await browser.newPage();

  for (let i = 0; i < hotels.length; i++) {
    await page.goto(hotels[i].link, { waitUntil: "networkidle2", timeout: 0 });
    await page.waitForSelector(".displayAvailability > div.startEndDatepickerWrapper > [id^=dp] > div > div.ui-datepicker-group.ui-datepicker-group-first > table ");
    await page.waitFor(4000);

    let secondMonth = await page.evaluate((select, selectMonth) => {
      var secondMonthBodyTable = document.querySelector(select).children[1];

      var targetTDs_list = secondMonthBodyTable.querySelectorAll('tr > td');
      var targetTDs = [...targetTDs_list];
      monthDetails = targetTDs.reduce((res, element) => {
        if(element.querySelector('a')!=null){
          res.push(element.getAttribute('data-day') + " - " + element.querySelector('a').getAttribute('data-price') + " - " + element.classList.contains('available'));
        }
        return res;
      }, []);

      var monthName = document.querySelector(selectMonth).textContent;
      return {
          name: monthName,
          body: monthDetails
        }
    },".displayAvailability > div.startEndDatepickerWrapper > [id^=dp] > div > div.ui-datepicker-group.ui-datepicker-group-last > table",
      "div > div.ui-datepicker-group.ui-datepicker-group-last > div > div"
    )

    let firstMonth = await page.evaluate((select, selectMonth) => {
      var firstMonthBodyTable = document.querySelector(select).children[1];
      var targetTDs_list = firstMonthBodyTable.querySelectorAll('tr > td');
      var targetTDs = [...targetTDs_list];

      monthDetails = targetTDs.reduce((res, element) => {
        if(element.querySelector('a')!=null){
          res.push(element.getAttribute('data-day') + " - " + element.querySelector('a').getAttribute('data-price') + " - " + element.classList.contains('available'));
        }
        return res;
      }, []);

      var firstMonthName = document.querySelector(selectMonth).textContent;

      return {
          name: firstMonthName,
          body: monthDetails
        }
    }, ".displayAvailability > div.startEndDatepickerWrapper > [id^=dp] > div > div.ui-datepicker-group.ui-datepicker-group-first > table",
      "div > div.ui-datepicker-group.ui-datepicker-group-first > div > div")


    
    updateDispoHotelFirebase(firstMonth, secondMonth, ref, hotels[i].id);
  }
}

let getHotelLocation = async page => {
  await page.waitForSelector("#tabGoodToKnow");
  const position = await page.evaluate(selector => {
    var position = document.querySelector(selector) ? document.querySelector(selector).src : null;
    if (position) {
      position = position.match(/center=(.*)&zoom/)[1];
      return {
        Lat: position.split(",")[0],
        Lng: position.split(",")[1]
      };
    } else return null;
  }, "#tabGoodToKnow > div > div > div.col-1-3.rightProperty > div.propertyStaticMap > div > img");

  if (!position) return null;

  const address = await page.evaluate(
    (stAddressSelect, postalSelect, localitySelect, countrySelect) => {
      var streetAddress = document.querySelector(stAddressSelect)
        ? document.querySelector(stAddressSelect).innerText
        : null;
      var postalCode = document.querySelector(postalSelect).innerText;
      var locality = document.querySelector(localitySelect).innerText;
      var country = document.querySelector(countrySelect).innerText;
      return {
        streetAddress: streetAddress,
        postalCode: postalCode,
        localityAddress: locality,
        countryAddress: country
      };
    },
    "#tabGoodToKnow > div > div > div.col-1-3.rightProperty > div.locationContact > span > span[itemprop*='streetAddress']",
    "#tabGoodToKnow > div > div > div.col-1-3.rightProperty > div.locationContact > span > span[itemprop*='postalCode']",
    "#tabGoodToKnow > div > div > div.col-1-3.rightProperty > div.locationContact > span > span[itemprop*='addressLocality']",
    "#tabGoodToKnow > div > div > div.col-1-3.rightProperty > div.locationContact > span > span[itemprop*='addressCountry']"
  );

  return {
    center: position,
    address: address
  };
};

exports.Castle = new Castle();
