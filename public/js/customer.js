const socket = io();

const vendorListEl = document.getElementById('vendors');

// Function to load vendors
async function loadVendors() {
    const res = await fetch('/api/vendors');
    const vendors = await res.json();
    renderVendors(vendors);
}

// Function to render vendors
function renderVendors(vendors) {
    vendorListEl.innerHTML = '';
    vendors.forEach(v => {
        const listItem = document.createElement('li');
        listItem.textContent = `${v.name} - ${v.shopName || 'No Shop Name'}`;
        listItem.addEventListener('click', () => {
            window.location.href = `/vendor-view.html?id=${v.id}`;
        });
        vendorListEl.appendChild(listItem);
    });
}

// Function to render vendors on the page
function renderVendors(vendors) {
    const vendorsContainer = document.getElementById('vendors');
    vendorsContainer.innerHTML = '';
    vendors.forEach(v => {
        const vendorCard = document.createElement('div');
        vendorCard.className = 'vendor-card';
        vendorCard.innerHTML = `
            <h3>${v.shopName || v.name}</h3>
            <button onclick="bookVendor('${v.id}')">Book</button>
        `;
        vendorsContainer.appendChild(vendorCard);
    });
}

// Function to book a vendor
async function bookVendor(vendorId) {
    const bookingDetails = {
        vendorId,
        customerName: prompt("Enter your name:"),
        mobile: prompt("Enter your mobile number:"),
        date: prompt("Enter booking date:"),
        notes: prompt("Any additional notes:")
    };
    const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingDetails)
    });
    const data = await res.json();
    if (data.ok) {
        alert('Booking submitted. Await admin approval.');
    } else {
        alert('Error: ' + data.error);
    }
}

// Listen for vendor updates
socket.on('vendors:updated', loadVendors);

// Initial load of vendors
loadVendors();

