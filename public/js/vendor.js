const socket = io();

// Function to join vendor room
function joinVendorRoom(vendorId) {
    socket.emit('join:vendor', vendorId);
}

// Listen for vendor approval notifications
socket.on('vendor:approved', (vendor) => {
    console.log('Vendor approved:', vendor);
    // Show notification to vendor
    alert('Your vendor application has been approved! You can now log in and manage your profile.');
});

// Listen for booking approval notifications
socket.on('vendor:bookingApproved', (booking) => {
    console.log('Booking approved:', booking);
    // Show notification to vendor
    alert(`New booking approved for ${booking.date} by ${booking.customerName}`);
});

// Function to update vendor profile
async function updateVendorProfile(vendorId, formData) {
    try {
        const response = await fetch(`/api/vendor/${vendorId}/profile`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        if (result.ok) {
            alert('Profile updated successfully!');
            return result.vendor;
        } else {
            alert('Error updating profile: ' + result.error);
        }
    } catch (error) {
        console.error('Error updating vendor profile:', error);
        alert('Error updating profile');
    }
}

// Function to get vendor details
async function getVendorDetails(vendorId) {
    try {
        const response = await fetch(`/api/vendors/${vendorId}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching vendor details:', error);
        return null;
    }
}

