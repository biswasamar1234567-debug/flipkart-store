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
  try {
    localStorage.setItem("selected_verient", JSON.stringify(itemData));
    sessionStorage.setItem("selected_verient", JSON.stringify(itemData));
  } catch(e) {}
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

  var raw = localStorage.getItem("selected_verient") || sessionStorage.getItem("selected_verient");
  if (raw) {
    try {
      itemData = JSON.parse(raw);
    } catch(e) {
      itemData = null;
    }
  }

  // If itemData is still missing or has no name, try loading from URL ?id= or cached catalog
  if (!itemData || !itemData.name) {
    var pid = new URLSearchParams(window.location.search).get("id");
    if (pid) {
      try {
        var cached = sessionStorage.getItem("fk_active_product_" + pid) || sessionStorage.getItem("fk_last_active_product");
        if (cached) {
          var p = JSON.parse(cached);
          if (p) {
            var pSell = Number(p.active_selling_price) || Number(p.selling_price) || 0;
            var pMrp = Number(p.active_mrp) || Number(p.mrp) || pSell;
            itemData = {
              id: p.id,
              name: p.title2 || p.name || "Product",
              title: p.title2 || p.name || "Product",
              mrp: pMrp,
              selling_price: pSell,
              unit_selling_price: pSell,
              unit_mrp: pMrp,
              qty: 1,
              color: p.selected_color || p.default_color || (p.colors && p.colors[0]?.color_name) || "",
              size: p.selected_size || p.default_size || p.size || "",
              storage: p.selected_storage || p.storage || "",
              ram: p.selected_ram || p.ram || "",
              img: p.img1 || p.image || (Array.isArray(p.images) && p.images[0]) || "",
              img1: p.img1 || p.image || (Array.isArray(p.images) && p.images[0]) || ""
            };
          }
        }
      } catch(e) {}
    }
  }

  // Catalog fallback if available
  if (!itemData || !itemData.name) {
    try {
      var catStr = sessionStorage.getItem("fk_catalog") || localStorage.getItem("fk_catalog");
      if (catStr) {
        var cat = JSON.parse(catStr);
        if (Array.isArray(cat) && cat.length > 0) {
          var targetId = new URLSearchParams(window.location.search).get("id");
          var p = (targetId ? cat.find(function(x) { return x.id === targetId || x._id === targetId; }) : null) || cat[0];
          var pSell = Number(p.active_selling_price) || Number(p.selling_price) || 0;
          var pMrp = Number(p.active_mrp) || Number(p.mrp) || pSell;
          itemData = {
            id: p.id,
            name: p.title2 || p.name || "Product",
            title: p.title2 || p.name || "Product",
            mrp: pMrp,
            selling_price: pSell,
            unit_selling_price: pSell,
            unit_mrp: pMrp,
            qty: 1,
            color: p.selected_color || p.default_color || (p.colors && p.colors[0]?.color_name) || "",
            size: p.selected_size || p.default_size || p.size || "",
            storage: p.selected_storage || p.storage || "",
            ram: p.selected_ram || p.ram || "",
            img: p.img1 || p.image || (Array.isArray(p.images) && p.images[0]) || "",
            img1: p.img1 || p.image || (Array.isArray(p.images) && p.images[0]) || ""
          };
        }
      }
    } catch(e) {}
  }

  // Parse prices from itemData FIRST before doing persistCartVariant!
  var rawSelling =
    (itemData && itemData.unit_selling_price !== undefined && itemData.unit_selling_price !== null && !isNaN(Number(itemData.unit_selling_price)))
      ? Number(itemData.unit_selling_price)
      : (itemData && itemData.selling_price !== undefined && itemData.selling_price !== null && !isNaN(Number(itemData.selling_price)))
        ? Number(itemData.selling_price)
        : 0;

  var rawMrp =
    (itemData && itemData.unit_mrp !== undefined && itemData.unit_mrp !== null && !isNaN(Number(itemData.unit_mrp)))
      ? Number(itemData.unit_mrp)
      : (itemData && itemData.mrp !== undefined && itemData.mrp !== null && !isNaN(Number(itemData.mrp)))
        ? Number(itemData.mrp)
        : rawSelling;

  cartUnitSelling = rawSelling;
  cartUnitMrp = rawMrp > 0 ? rawMrp : rawSelling;
  cartQty = Math.max(1, parseInt(itemData?.qty, 10) || 1);

  if (itemData) {
    persistCartVariant();
  }

  var imgSrc = itemData ? (itemData.img1 || itemData.img || "") : "";
  if (imgSrc && !imgSrc.startsWith("http") && !imgSrc.startsWith("/") && !imgSrc.startsWith("../")) {
    imgSrc = "../" + imgSrc;
  }
  if (imgSrc) {
    $("#item_image").prop("src", imgSrc);
  }

  var detailParts = [];
  if (itemData) {
    if (itemData.color) detailParts.push(itemData.color);
    if (itemData.size) detailParts.push("Size: " + itemData.size);
    if (itemData.storage) detailParts.push(itemData.storage);
    if (itemData.ram) detailParts.push(itemData.ram);
  }
  var detail = detailParts.join(" • ");
  if (!detail && itemData && itemData.subtitle) {
    detail = itemData.subtitle;
  }

  if (itemData && itemData.name) {
    $("#product-title").text(itemData.name);
  }
  $("#product-detail").text(detail);

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
