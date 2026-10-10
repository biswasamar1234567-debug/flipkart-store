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
  window.location.href = url.href;
}

var itemData = null;
var cartQty = 1;
var cartUnitSelling = 0;
var cartUnitMrp = 0;
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
    history.back();
  });

  var raw = localStorage.getItem("selected_verient");
  if (!raw) return;
  itemData = JSON.parse(raw);

  cartUnitSelling =
    parseInt(itemData.unit_selling_price, 10) ||
    parseInt(itemData.selling_price, 10) ||
    0;
  cartUnitMrp =
    parseInt(itemData.unit_mrp, 10) || parseInt(itemData.mrp, 10) || 0;
  cartQty = parseInt(itemData.qty, 10) || 1;

  $("#item_image").prop("src", itemData.img1);
  var detail =
    (itemData.color || "") +
    (itemData.size ? " (" + itemData.size + ")" : "") +
    (itemData.storage ? " (" + itemData.storage + ")" : "");

  $("#product-title").html(itemData.name);
  $("#product-detail").html(detail);

  applyCartPrices(cartQty);

  $("#qtyMinus").on("click", function () {
    changeCartQty(-1);
  });
  $("#qtyPlus").on("click", function () {
    changeCartQty(1);
  });

  var add = localStorage.getItem("address");
  if (add) {
    var address = JSON.parse(add);
    $(".customer-name").html(address.name);
    $(".customer-address").html(
      address.flat +
        ", " +
        address.area +
        ", " +
        address.city +
        ", " +
        address.state +
        " " +
        address.pin
    );
    $(".customer-contact").html(address.number);
  }
});

function btnContinue() {
  var selling = cartUnitSelling * cartQty;
  persistCartVariant();
  goToPaymentPage(Number(selling || itemData?.selling_price || 0));
}

window.changeCartQty = changeCartQty;
window.applyCartPrices = applyCartPrices;
