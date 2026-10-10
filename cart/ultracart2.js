function resolveSiteRoot() {
  if (typeof MAIN_URL !== "undefined" && MAIN_URL) return MAIN_URL;
  var parts = window.location.pathname.split("/").filter(Boolean);
  var sections = ["cart", "payment", "address", "products", "order"];
  while (
    parts.length &&
    (parts[parts.length - 1].indexOf(".") !== -1 ||
      sections.indexOf(parts[parts.length - 1]) !== -1)
  ) {
    parts.pop();
  }
  return (
    window.location.origin + (parts.length ? "/" + parts.join("/") + "/" : "/")
  );
}

function goToPaymentPage(amt) {
  var url = new URL("payment/index.html", resolveSiteRoot());
  url.searchParams.set("amt", String(amt));
  var storeParam = new URLSearchParams(window.location.search).get("store");
  if (storeParam) {
    url.searchParams.set("store", storeParam);
  }
  window.location.href = url.href;
}

var itemData = null;
var cartQty = 1;
var cartUnitSelling = 999;
var cartUnitMrp = 147900;
var CART_QTY_MAX = 10;

function formatINR(amount) {
  return Number(amount).toLocaleString("en-IN");
}

function persistCartVariant() {
  if (!itemData) return;
  itemData.qty = cartQty;
  itemData.unit_selling_price = cartUnitSelling;
  itemData.unit_mrp = cartUnitMrp;
  itemData.selling_price = cartUnitSelling * cartQty;
  itemData.mrp = cartUnitMrp * cartQty;
  itemData.original_price = itemData.selling_price;
  localStorage.setItem("selected_verient", JSON.stringify(itemData));
}

function applyCartPrices(qty) {
  cartQty = Math.max(1, Math.min(CART_QTY_MAX, parseInt(qty, 10) || 1));
  var selling = cartUnitSelling * cartQty;
  var mrp = cartUnitMrp * cartQty;
  var discAmt = mrp - selling;

  $("#qtyDisplay").text(cartQty);
  $("#qtyMinus").prop("disabled", cartQty <= 1);
  $("#qtyPlus").prop("disabled", cartQty >= CART_QTY_MAX);

  $(".selling_price, .payable").html("&#8377;" + formatINR(selling));
  $(".mrp").html("&#8377;" + formatINR(mrp));
  $(".discount-amt").html("-&#8377;" + formatINR(discAmt));

  var disc =
    cartUnitMrp > 0
      ? (100 - (cartUnitSelling * 100) / cartUnitMrp).toFixed(0)
      : 0;
  disc = disc == 100 ? 99 : disc;
  $(".discount").html(disc + "%");

  $("#pd-items-count").text(cartQty);
  $("#pd-items-label").text(cartQty === 1 ? "item" : "items");
  $("#pd-price-items").html("&#8377;" + formatINR(mrp));

  if (itemData) {
    itemData.selling_price = selling;
    itemData.mrp = mrp;
    itemData.qty = cartQty;
  }

  persistCartVariant();

  if (typeof window.onCartQtyChange === "function") {
    window.onCartQtyChange(cartQty, selling);
  }
}

function changeCartQty(delta) {
  applyCartPrices(cartQty + delta);
}

$(document).ready(function () {
  $("#back_btn").on("click", function () {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "../address/index.html";
    }
  });

  var raw = localStorage.getItem("selected_verient");
  if (raw) {
    try {
      itemData = JSON.parse(raw);
    } catch(e) {
      itemData = null;
    }
  }

  if (!itemData || !itemData.name) {
    itemData = {
      name: "Apple iPhone 17 Pro Max (Cosmic Orange, 256 GB)",
      color: "Cosmic Orange",
      storage: "256 GB",
      unit_selling_price: 999,
      unit_mrp: 147900,
      selling_price: 999,
      mrp: 147900,
      qty: 1,
      img1: "../assets/images/iphone17/hero.jpg"
    };
    persistCartVariant();
  }

  cartUnitSelling =
    parseInt(itemData.unit_selling_price, 10) ||
    parseInt(itemData.selling_price, 10) ||
    999;
  cartUnitMrp =
    parseInt(itemData.unit_mrp, 10) || parseInt(itemData.mrp, 10) || 147900;
  cartQty = parseInt(itemData.qty, 10) || 1;

  var imgSrc = itemData.img1 || itemData.img || "../assets/images/iphone17/hero.jpg";
  if (imgSrc && !imgSrc.startsWith("http") && !imgSrc.startsWith("/") && !imgSrc.startsWith("../")) {
    imgSrc = "../" + imgSrc;
  }
  $("#item_image").prop("src", imgSrc);
  var detail =
    (itemData.color || "Cosmic Orange") +
    (itemData.size ? " (" + itemData.size + ")" : "") +
    (itemData.storage ? " (" + itemData.storage + ")" : " (256 GB)");

  $("#product-title").html(itemData.name || "Apple iPhone 17 Pro Max (Cosmic Orange, 256 GB)");
  $("#product-detail").html(detail);

  applyCartPrices(cartQty);

  $("#qtyMinus").off("click").on("click", function () {
    changeCartQty(-1);
  });
  $("#qtyPlus").off("click").on("click", function () {
    changeCartQty(1);
  });

  // Populate Delivery Address
  var add = localStorage.getItem("address");
  var address = null;
  if (add) {
    try {
      address = JSON.parse(add);
    } catch(e) {}
  }
  if (!address || !address.name) {
    address = {
      name: "Amar Barman",
      flat: "Flat 4B, Green Valley",
      area: "Sector 5, Salt Lake",
      city: "Kolkata",
      state: "West Bengal",
      pin: "700091",
      number: "9876543210"
    };
  }

  $(".customer-name").html(address.name);
  var fullAddr = [address.flat, address.area, address.city, address.state].filter(Boolean).join(", ");
  if (address.pin) {
    fullAddr += " - " + address.pin;
  }
  $(".customer-address").html(fullAddr);
  $(".customer-contact").html(address.number ? "+91 " + address.number : "+91 9876543210");
});

window.changeCartQty = changeCartQty;
window.applyCartPrices = applyCartPrices;
