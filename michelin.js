const axios = require("axios");
var Michelin = function() {};
const url_query = "https://restaurant.michelin.fr/index.php?q=search/autocomplete/";
const url_michelin = "https://restaurant.michelin.fr";

Michelin.prototype.getRestaurantDetails = async function(name, page) {
  var restaurant_name = name.replace(/(^\w')/gi, "").toLowerCase();
  var encoded_restaurant = encodeURI(restaurant_name);
  var restaurant = {};

  return axios.get(url_query + encoded_restaurant)
  .then(async response => {
    var result_key = Object.keys(response.data).filter((element) => /poi/.test(element))[0];
    var result = response.data[result_key];
    if (typeof result != "undefined") {
      var href = result.match(/href="(.+?)">/i)[1];
      var restaurant_name_website = "null";
      console.log("\t[#] restaurant " + url_michelin + href);
      restaurant.michelin_url = url_michelin + href;

      await page.goto(url_michelin + href, { waitUntil: "load", timeout: 0 });

      restaurant_name_website = await page.evaluate(selector => {
        return document.querySelector(selector).innerText;
      }, "body > div.l-page > div > div.l-main > div > div.panel-display.panels-michelin-content-layout.panels-michelin-2colsidebar.clearfix > div.panels-content-main.panels-content-main_regionone > div > div.panels-content-main-left > div > div > div > div > h1");


      if (restaurant_name === restaurant_name_website.toLowerCase()) {
        restaurant.stars = await page.evaluate(selector => {
          var stars = document.querySelector(selector);
          if (!stars || !stars.innerText.includes("MICHELIN")) return null;
          else return stars.innerText.match(/\d/i)[0];
        }, "#node_poi-guide-wrapper > div.node_poi-distinction-section > ul > li > div.content-wrapper");

        restaurant.location = await page.evaluate(
          (selector1, selector2) => {
            if(!document.querySelector(selector1)||!document.querySelector(selector2)) return "none";
            return {
              street: document.querySelector(selector1).innerText,
              postal: document.querySelector(selector2).innerText
            }
          },
          "#map-location > div.field.field--name-field-address.field--type-addressfield.field--label-hidden > div > div > div.street-block > div",
          "#map-location > div.field.field--name-field-address.field--type-addressfield.field--label-hidden > div > div > div.addressfield-container-inline.locality-block.country-FR"
        );
      }
    }
    return restaurant;
  })
  .catch(error => {
    console.log(error.response);
    return restaurant;
  });
};

exports.Michelin = new Michelin();
