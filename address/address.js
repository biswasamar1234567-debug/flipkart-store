// ==========================================================================
// FLIPKART DELIVERY ADDRESS SCRIPT
// Handles address gathering, localStorage persistence, auto-fill, and redirect
// ==========================================================================

function getAddressFields() {
  const stateSelect = document.getElementById('state');
  return {
    name: (document.getElementById('name')?.value || '').trim(),
    number: (document.getElementById('number')?.value || '').trim(),
    pin: (document.getElementById('pin')?.value || '').trim(),
    city: (document.getElementById('city')?.value || '').trim(),
    state_id: stateSelect?.value || '',
    state: stateSelect?.options[stateSelect.selectedIndex]?.text || '',
    flat: (document.getElementById('flat')?.value || '').trim(),
    area: (document.getElementById('area')?.value || '').trim()
  };
}

function showToast(text) {
  const toast = document.getElementById('toastMsg');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function goToCart(address) {
  localStorage.setItem('address', JSON.stringify(address));
  showToast('✓ Address Saved');
  setTimeout(() => {
    const targetCartUrl = window.location.pathname.includes('/address') ? '../cart/index.html' : 'cart/index.html';
    const params = new URLSearchParams(window.location.search);
    const qs = params.toString() ? ('?' + params.toString()) : '';
    window.location.href = targetCartUrl + qs;
  }, 400);
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Auto-fill from localStorage if previously saved
  try {
    const saved = localStorage.getItem('address');
    if (saved) {
      const addr = JSON.parse(saved);
      if (addr.name) document.getElementById('name').value = addr.name;
      if (addr.number) document.getElementById('number').value = addr.number;
      if (addr.pin) document.getElementById('pin').value = addr.pin;
      if (addr.city) document.getElementById('city').value = addr.city;
      if (addr.state_id) document.getElementById('state').value = addr.state_id;
      if (addr.flat) document.getElementById('flat').value = addr.flat;
      if (addr.area) document.getElementById('area').value = addr.area;
    }
  } catch (e) {}

  // 2. Save Address Button Click
  const saveBtn = document.getElementById('quickSaveBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const address = getAddressFields();
      goToCart(address);
    });
  }

  // 3. Back Button
  const backBtn = document.getElementById('back_btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'product.html?id=iphone17';
      }
    });
  }
});
