const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const dayjs = require('dayjs');
require('dotenv').config();
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, '..', 'public');
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

// MongoDB setup
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/naandi';
mongoose.set('strictQuery', true);
mongoose.connect(mongoUri).then(()=> console.log('MongoDB connected')).catch(err=> console.error('MongoDB error', err));

const VendorSchema = new mongoose.Schema({
  name: String,
  email: String,
  mobile: String,
  password: String,
  shopName: String,
  description: String,
  services: String,
  portfolio: String,
  pricing: String,
  address: String,
  location: { lat: Number, lng: Number },
  images: [String],
  profilePic: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});
const TempRegSchema = new mongoose.Schema({
  name: String,
  email: String,
  mobile: String,
  password: String,
  businessName: String,
  services: String,
  portfolio: String,
  pricing: String,
  createdAt: { type: Date, default: Date.now }
});
const BookingSchema = new mongoose.Schema({
  vendorId: String,
  customerName: String,
  mobile: String,
  date: String,
  notes: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  mobile: String,
  role: String,
  password: String,
  profilePic: String
});

const Vendor = mongoose.model('Vendor', VendorSchema);
const TempReg = mongoose.model('TempReg', TempRegSchema);
const Booking = mongoose.model('Booking', BookingSchema);
const User = mongoose.model('User', UserSchema);

// Remove Dhanush vendor if exists
(async ()=>{
  try{
    const dhanush = await Vendor.findOne({ name: /dhanush/i }).lean();
    if(dhanush){
      await Vendor.findByIdAndDelete(dhanush._id);
      console.log('Removed vendor Dhanush from database');
    }
  }catch(e){ /* noop */ }
})();

// Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage });

// Socket.IO rooms
io.on('connection', (socket) => {
  socket.on('join:admin', () => socket.join('admins'));
  socket.on('join:vendor', (vendorId) => socket.join(`vendor:${vendorId}`));
});

app.post('/api/vendor/register', async (req, res) => {
  const { name, email, mobile, password } = req.body;
  if (!name || !email || !mobile) return res.status(400).json({ error: 'Missing fields' });
  const temp = await TempReg.create({ name, email, mobile, password: password || '' });
  res.json({ tempId: String(temp._id), message: 'Proceed to next step' });
});

app.post('/api/vendor/register/plans', async (req, res) => {
  const { name, email, mobile } = req.body;
  if (!name || !email || !mobile) return res.status(400).json({ error: 'Missing fields' });
  await db.read();
  const id = uuidv4();
  db.data.otps.push({ id, name, email, mobile, createdAt: Date.now() });
  await db.write();
  res.json({ tempId: id, message: 'Proceed to next step' });
});

// Step 2: Plans and business name
app.post('/api/vendor/register/plans', upload.none(), async (req, res) => {
  const { tempId, businessName, services, portfolio, pricing } = req.body;
  const updated = await TempReg.findByIdAndUpdate(tempId, { businessName, services, portfolio, pricing }, { new: true });
  if (!updated) return res.status(404).json({ error: 'Registration not found' });
  res.json({ ok: true });
});

app.post('/api/vendor/register/complete', upload.array('media', 10), async (req, res) => {
  const { tempId, lat, lng, address } = req.body;
  const base = await TempReg.findById(tempId);
  if (!base) return res.status(404).json({ error: 'Registration not found' });
  const files = (req.files || []).map(f => `/uploads/${path.basename(f.path)}`);
      const description = [`Services: ${base.services || 'N/A'}`, base.portfolio ? `Portfolio: ${base.portfolio}` : '', base.pricing ? `Pricing: ${base.pricing}` : ''].filter(Boolean).join('\n');
  const vendor = await Vendor.create({
    name: base.name,
    email: base.email,
    mobile: base.mobile,
    password: base.password || '',
          shopName: base.businessName || '',
      description,
      services: base.services || '',
      portfolio: base.portfolio || '',
      pricing: base.pricing || '',
    address: address || '',
    location: { lat: Number(lat) || 0, lng: Number(lng) || 0 },
    images: files,
    profilePic: '',
    status: 'pending'
  });
  await TempReg.findByIdAndDelete(tempId);
  io.to('admins').emit('admin:newVendor', vendor);
  res.json({ message: 'Application Submitted, Waiting for Admin’s Approval.', vendorId: String(vendor._id) });
});

// Admin APIs
app.get('/api/admin/vendors', async (req, res) => {
  const { status } = req.query;
  const query = status ? { status } : {};
  const list = await Vendor.find(query).lean();
  res.json(list);
});

app.get('/api/admin/vendor/:id', async (req, res) => {
  const v = await Vendor.findById(req.params.id).lean();
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});

app.post('/api/admin/vendor/:id/approve', async (req, res) => {
  const v = await Vendor.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true }).lean();
  if (!v) return res.status(404).json({ error: 'Not found' });
  notifySMS(v.mobile, 'Your Application has been Approved.');
  io.emit('vendors:updated', { id: String(v._id), status: v.status });
  io.to(`vendor:${v._id}`).emit('vendor:approved', v);
  res.json({ ok: true });
});

app.post('/api/admin/vendor/:id/reject', async (req, res) => {
  const v = await Vendor.findByIdAndUpdate(req.params.id, { status: 'rejected' }, { new: true }).lean();
  if (!v) return res.status(404).json({ error: 'Not found' });
  notifySMS(v.mobile, 'Your Application has been Rejected.');
  io.emit('vendors:updated', { id: String(v._id), status: v.status });
  res.json({ ok: true });
});

// Delete vendor (admin only)
app.delete('/api/admin/vendor/:id', async (req, res) => {
  try {
    const v = await Vendor.findByIdAndDelete(req.params.id);
    if (!v) return res.status(404).json({ error: 'Vendor not found' });
    
    // Also delete related bookings
    await Booking.deleteMany({ vendorId: String(v._id) });
    
    io.emit('vendors:updated', { id: String(v._id), deleted: true });
    res.json({ ok: true, message: 'Vendor deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
});

// Vendor login (simple: by mobile if approved)
app.post('/api/vendor/login', async (req, res) => {
  const { mobile, password } = req.body;
  const query = { mobile, status: 'approved' };
  if (password) query.password = password;
  const v = await Vendor.findOne(query).lean();
  if (!v) return res.status(403).json({ error: 'Not approved or not found' });
  res.json({ vendorId: String(v._id), vendor: v });
});

// Vendor email + password login
app.post('/api/vendor/login/email', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  const v = await Vendor.findOne({ email, password, status: 'approved' }).lean();
  if (!v) return res.status(401).json({ error: 'Invalid credentials or not approved' });
  res.json({ vendorId: String(v._id), vendor: v });
});

// Vendor availability
const AvailabilitySchema = new mongoose.Schema({ vendorId:String, date:String });
const Availability = mongoose.model('Availability', AvailabilitySchema);
app.get('/api/vendor/:id/availability', async (req,res)=>{
  const days = await Availability.find({ vendorId:req.params.id }).lean();
  res.json(days);
});
app.post('/api/vendor/:id/availability', async (req,res)=>{
  const { dates } = req.body; // array of ISO dates
  await Availability.deleteMany({ vendorId:req.params.id });
  await Availability.insertMany((dates||[]).map(d=>({ vendorId:req.params.id, date:d })));
  res.json({ ok:true });
});

// Vendor orders
app.get('/api/vendor/:id/orders', async (req,res)=>{
  const orders = await Booking.find({ vendorId:req.params.id }).lean();
  res.json(orders);
});

// Vendor profile updates
app.post('/api/vendor/:id/profile', upload.single('profilePic'), async (req, res) => {
  const { shopName, description, address, lat, lng } = req.body;
  const update = { };
  if (req.file) update.profilePic = `/uploads/${path.basename(req.file.path)}`;
  if (shopName !== undefined) update.shopName = shopName;
  if (description !== undefined) update.description = description;
  if (address !== undefined) update.address = address;
  if (lat !== undefined && lng !== undefined) update.location = { lat: Number(lat), lng: Number(lng) };
  const v = await Vendor.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
  if (!v) return res.status(404).json({ error: 'Not found' });
  io.emit('vendors:updated', v);
  res.json({ ok: true, vendor: v });
});

// Public Vendors list
app.get('/api/vendors', async (req, res) => {
  const list = await Vendor.find({ status: 'approved' }).lean();
  res.json(list);
});

app.get('/api/vendors/:id', async (req, res) => {
  const v = await Vendor.findOne({ _id: req.params.id, status: 'approved' }).lean();
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});

// Booking APIs
app.post('/api/bookings', async (req, res) => {
  const { vendorId, customerName, date, notes, mobile } = req.body;
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  const booking = await Booking.create({ vendorId, customerName, mobile, date, notes });
  io.to('admins').emit('admin:newBooking', booking);
  res.json({ ok: true, booking });
});

app.get('/api/admin/bookings', async (req, res) => {
  const { status } = req.query;
  const query = status ? { status } : {};
  const list = await Booking.find(query).lean();
  res.json(list);
});

app.post('/api/admin/bookings/:id/approve', async (req, res) => {
  const b = await Booking.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true }).lean();
  if (!b) return res.status(404).json({ error: 'Not found' });
  const vendor = await Vendor.findById(b.vendorId).lean();
  if (vendor) {
    io.to(`vendor:${vendor._id}`).emit('vendor:bookingApproved', b);
    notifySMS(vendor.mobile, `New booking approved for ${b.date} by ${b.customerName}`);
  }
  res.json({ ok: true });
});

// Auth: register/login simple (role by password)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, mobile, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const role = password === 'Naandi@123' ? 'admin' : 'customer';
  try {
    await User.create({ name, email, mobile: mobile || '', role, password });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    return res.status(500).json({ error: 'Server error' });
  }
  res.json({ ok: true, role });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  // Try admin/customer first
  const user = await User.findOne({ email, password }).lean();
  if (user) {
    return res.json({ ok: true, role: user.role, name: user.name, email: user.email });
  }
  // Then try vendor email + password (only if approved)
  const vendor = await Vendor.findOne({ email, password, status: 'approved' }).lean();
  if (vendor) {
    return res.json({ ok: true, role: 'vendor', name: vendor.name, email: vendor.email, vendorId: String(vendor._id) });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

// Admin profile
app.get('/api/admin/me', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = await User.findOne({ email }).lean();
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ name: user.name, email: user.email, role: user.role, profilePic: user.profilePic || '' });
});

app.post('/api/admin/me/photo', upload.single('photo'), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!req.file) return res.status(400).json({ error: 'photo required' });
  const profilePic = `/uploads/${path.basename(req.file.path)}`;
  const user = await User.findOneAndUpdate({ email }, { profilePic }, { new: true }).lean();
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, profilePic });
});

// Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Naandi server running on http://localhost:${PORT}`);
});


