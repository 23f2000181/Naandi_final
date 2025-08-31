const socket = io();
socket.emit('join:admin');

// Initialize admin data
let adminData = {};

// Load admin data
async function loadAdminData() {
  try {
    const adminEmail = localStorage.getItem('adminEmail');
    if (!adminEmail) {
      window.location.href = '/signin.html';
      return;
    }
    
    const res = await fetch(`/api/admin/me?email=${adminEmail}`);
    adminData = await res.json();
    
    // Update UI
    document.getElementById('adminName').textContent = adminData.name || 'Admin';
    document.getElementById('adminNameNav').textContent = adminData.name || 'Admin';
    document.getElementById('adminEmail').textContent = adminData.email || '';
    
    if (adminData.profilePic) {
      document.getElementById('adminAvatar').src = adminData.profilePic;
    }
    
  } catch (error) {
    console.error('Error loading admin data:', error);
  }
}

// Tab system
function showTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  
  // Show selected tab
  document.getElementById(tabName).classList.add('active');
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

// Status messages
function showStatus(message, type = 'success') {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.style.display = 'block';
  
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

// Dashboard stats
async function loadDashboardStats() {
  try {
    // Load vendors count
    const vendorsRes = await fetch('/api/admin/vendors');
    const vendors = await vendorsRes.json();
    document.getElementById('totalVendors').textContent = vendors.length || 0;
    
    // Load pending vendors count
    const pendingRes = await fetch('/api/admin/vendors?status=pending');
    const pendingVendors = await pendingRes.json();
    document.getElementById('pendingRequests').textContent = pendingVendors.length || 0;
    
    // Load bookings count
    const bookingsRes = await fetch('/api/admin/bookings');
    const bookings = await bookingsRes.json();
    document.getElementById('totalBookings').textContent = bookings.length || 0;
    
    // Calculate revenue (mock data for now)
    const totalRevenue = bookings.length * 5000; // Mock calculation
    document.getElementById('totalRevenue').textContent = `₹${totalRevenue.toLocaleString()}`;
    
    // Update badges
    document.getElementById('pendingCount').textContent = pendingVendors.length || 0;
    document.getElementById('newBookingsCount').textContent = bookings.filter(b => b.status === 'pending').length || 0;
    
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load recent activity
async function loadRecentActivity() {
  try {
    const recentActivityEl = document.getElementById('recentActivity');
    const vendorsRes = await fetch('/api/admin/vendors?status=pending');
    const pendingVendors = await vendorsRes.json();
    
    if (pendingVendors.length === 0) {
      recentActivityEl.innerHTML = '<p class="muted">No recent activity</p>';
    } else {
      recentActivityEl.innerHTML = pendingVendors.slice(0, 3).map(vendor => `
        <div class="activity-item">
          <div class="activity-icon">👤</div>
          <div class="activity-content">
            <strong>${vendor.name}</strong> submitted a vendor application
            <small class="muted">${new Date(vendor.createdAt).toLocaleDateString()}</small>
          </div>
        </div>
      `).join('');
    }
    
  } catch (error) {
    console.error('Error loading recent activity:', error);
  }
}

// Vendor management
async function loadPendingVendors() {
  try {
    const res = await fetch('/api/admin/vendors?status=pending');
    const data = await res.json();
    renderVendors(data);
  } catch (error) {
    console.error('Error loading pending vendors:', error);
  }
}

function renderVendors(list) {
  const newRequestsEl = document.getElementById('newRequests');
  if(!newRequestsEl) return;
  
  if(!list.length){ 
    newRequestsEl.innerHTML = '<div class="table-placeholder"><p class="muted">No new requests</p></div>';
    return; 
  }
  
  newRequestsEl.innerHTML = '';
  list.forEach(v => {
    const id = v._id || v.id;
    const vendorCard = document.createElement('div');
    vendorCard.className = 'vendor-card';
    vendorCard.innerHTML = `
      <div class="vendor-info">
        <h4>${v.shopName || v.name}</h4>
        <p class="muted">${v.name} • ${v.email}</p>
        <p>${v.description || 'No description provided'}</p>
        <small class="muted">Applied: ${new Date(v.createdAt).toLocaleDateString()}</small>
      </div>
      <div class="vendor-actions">
        <button class="btn btn-light view-btn">View Details</button>
        <button class="btn approve-btn">Approve</button>
        <button class="btn btn-light reject-btn">Reject</button>
      </div>
    `;
    
    vendorCard.querySelector('.approve-btn').addEventListener('click', async () => {
      try {
        await fetch(`/api/admin/vendor/${id}/approve`, { method:'POST' });
        showStatus('Vendor approved successfully!', 'success');
        loadPendingVendors();
        loadVerified();
        loadDashboardStats();
      } catch (error) {
        showStatus('Error approving vendor', 'error');
      }
    });
    
    vendorCard.querySelector('.reject-btn').addEventListener('click', async () => {
      try {
        await fetch(`/api/admin/vendor/${id}/reject`, { method:'POST' });
        showStatus('Vendor rejected', 'success');
        loadPendingVendors();
        loadDashboardStats();
      } catch (error) {
        showStatus('Error rejecting vendor', 'error');
      }
    });
    
    vendorCard.querySelector('.view-btn').addEventListener('click', () => {
      window.location.href = `/vendor-view.html?id=${id}&admin=1`;
    });
    
    // Add delete button for admin
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-light delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.marginLeft = '8px';
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this vendor? This action cannot be undone.')) {
        try {
          await fetch(`/api/admin/vendor/${id}`, { method: 'DELETE' });
          showStatus('Vendor deleted successfully', 'success');
          loadPendingVendors();
          loadDashboardStats();
        } catch (error) {
          showStatus('Error deleting vendor', 'error');
        }
      }
    });
    vendorCard.querySelector('.vendor-actions').appendChild(deleteBtn);
    
    newRequestsEl.appendChild(vendorCard);
  });
}

async function loadPendingBookings() {
  try {
    const res = await fetch('/api/admin/bookings?status=pending');
    const data = await res.json();
    renderBookings(data);
  } catch (error) {
    console.error('Error loading pending bookings:', error);
  }
}

function renderBookings(list) {
  const newBookingsEl = document.getElementById('newBookings');
  if (!newBookingsEl) return;
  
  if (list.length === 0) {
    newBookingsEl.innerHTML = '<div class="table-placeholder"><p class="muted">No new bookings</p></div>';
    return;
  }
  
  newBookingsEl.innerHTML = '';
  list.forEach(b => addBookingCard(b));
}

function addBookingCard(b) {
  const newBookingsEl = document.getElementById('newBookings');
  const bookingCard = document.createElement('div');
  bookingCard.className = 'booking-card';
  bookingCard.innerHTML = `
    <div class="booking-info">
      <h4>${b.customerName}</h4>
      <p class="muted">${b.date} • ${b.mobile || 'No phone'}</p>
      <p>${b.notes || 'No additional notes'}</p>
    </div>
    <div class="booking-actions">
      <button class="btn approve-btn">Approve</button>
      <button class="btn btn-light reject-btn">Reject</button>
    </div>
  `;
  
  bookingCard.querySelector('.approve-btn').addEventListener('click', async () => {
    try {
      await fetch(`/api/admin/bookings/${b._id || b.id}/approve`, { method: 'POST' });
      showStatus('Booking approved successfully!', 'success');
      loadPendingBookings();
      loadDashboardStats();
    } catch (error) {
      showStatus('Error approving booking', 'error');
    }
  });
  
  bookingCard.querySelector('.reject-btn').addEventListener('click', async () => {
    try {
      await fetch(`/api/admin/bookings/${b._id || b.id}/reject`, { method: 'POST' });
      showStatus('Booking rejected', 'success');
      loadPendingBookings();
      loadDashboardStats();
    } catch (error) {
      showStatus('Error rejecting booking', 'error');
    }
  });
  
  newBookingsEl.appendChild(bookingCard);
}

async function loadVerified(){
  const verifiedRequestsEl = document.getElementById('verifiedRequests');
  if(!verifiedRequestsEl) return;
  
  try {
    const res = await fetch('/api/admin/vendors?status=approved');
    const data = await res.json();
    
    if (data.length === 0) {
      verifiedRequestsEl.innerHTML = '<div class="table-placeholder"><p class="muted">No approved vendors</p></div>';
      return;
    }
    
    verifiedRequestsEl.innerHTML = '';
    data.forEach(v => {
      const id = v._id || v.id;
      const vendorCard = document.createElement('div');
      vendorCard.className = 'vendor-card';
      vendorCard.innerHTML = `
        <div class="vendor-info">
          <h4>${v.shopName || v.name}</h4>
          <p class="muted">${v.name} • ${v.email}</p>
          <p>${v.description || 'No description provided'}</p>
          <span class="status-badge approved">✓ Approved</span>
        </div>
        <div class="vendor-actions">
          <a class="btn btn-light" href="/vendor-view.html?id=${id}&admin=1">View Profile</a>
          <button class="btn btn-light delete-btn" style="margin-left: 8px;">Delete</button>
        </div>
      `;
      
      // Add delete functionality
      vendorCard.querySelector('.delete-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this vendor? This action cannot be undone.')) {
          try {
            await fetch(`/api/admin/vendor/${id}`, { method: 'DELETE' });
            showStatus('Vendor deleted successfully', 'success');
            loadVerified();
            loadDashboardStats();
          } catch (error) {
            showStatus('Error deleting vendor', 'error');
          }
        }
      });
      
      verifiedRequestsEl.appendChild(vendorCard);
    });
  } catch (error) {
    console.error('Error loading verified vendors:', error);
  }
}

// Socket events
socket.on('admin:newVendor', () => { 
  showStatus('New vendor application received!', 'success');
  loadPendingVendors();
  loadDashboardStats();
  loadRecentActivity();
});

socket.on('admin:newBooking', () => { 
  showStatus('New booking request received!', 'success');
  loadPendingBookings();
  loadDashboardStats();
});

// Load initial data
loadAdminData();
loadPendingVendors();
loadVerified();
loadPendingBookings();
loadDashboardStats();
loadRecentActivity();

// Tab navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const tabName = item.getAttribute('data-tab');
    showTab(tabName);
  });
});

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // TODO: Implement filtering
  });
});

// Avatar lightbox functionality
const adminAvatar = document.getElementById('adminAvatar');
const avatarLightbox = document.getElementById('avatarLightbox');
const avatarLightboxImg = document.getElementById('avatarLightboxImg');
const avatarLightboxClose = document.querySelector('.avatar-lightbox-close');

if (adminAvatar) {
  adminAvatar.addEventListener('click', () => {
    avatarLightboxImg.src = adminAvatar.src;
    avatarLightbox.style.display = 'flex';
  });
}

if (avatarLightboxClose) {
  avatarLightboxClose.addEventListener('click', () => {
    avatarLightbox.style.display = 'none';
  });
}

if (avatarLightbox) {
  avatarLightbox.addEventListener('click', (e) => {
    if (e.target === avatarLightbox) {
      avatarLightbox.style.display = 'none';
    }
  });
}

