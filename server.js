const express = require('express');
const cookieParser = require('cookie-parser');
const User = require("./Model/User.js");
const app = express();
const server = require('http').createServer(app);
const mongoose = require("mongoose");
require("dotenv").config();
const Document = require("./Model/MongoDB.js");
const passport =require("passport");
const checkRoom = require('./Routers/checkRoom.js')
const initializePassport = require('./passport');
const { v4: uuid } = require('uuid');
const {String2HexCodeColor} = require('string-to-hex-code-color');
const io = require('socket.io')(server,{
  cors:
  {
    origin: "http://localhost:3000",
    allowedHeaders: ["*"],
    credentials: true
  }
});
const session = require("express-session")({
  name: 'coder',
  secret: "my-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 3600 * 24 * 15
  }
})


app.use(express.urlencoded({ extended : true }));
app.use(express.json());
app.use(cookieParser("my-secret"));
app.use(session);

io.use((socket, next) => session(socket.request, {}, next));

app.use(passport.initialize())
app.use(passport.session())
initializePassport();

mongoose.connect(process.env.MONGODB_URI,  
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
.then(() => console.log('DATABASE CONNECTED'))
.catch(err => console.error("Error connecting to mongo", err));

app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', "http://localhost:3000");
	res.setHeader('Access-Control-Allow-Headers', 'content-type,Authorization');
	res.setHeader('Access-Control-Allow-Credentials', true);
	next();
});

const rooms = new Map();
const string2HexCodeColor = new String2HexCodeColor();

io.on('connection', async (socket) => {
  // console.log(socket?.request?.session?.passport?.user);
  var id=socket.id;
  var doc;
  var room = socket?.handshake?.query?.room;
  var user=socket?.request?.session?.passport?.user;
  var color = string2HexCodeColor.stringToColor(socket.id,0.5);

  if(!user||user===null||user===''||user==='null'){
    user='GUEST';
  }

  if(room?.length===0){
    room=uuid();
    await Document.create({ _id: room, data: '' });
  }
  user['socketId'] = socket.id;
  user['color'] =  color;

  console.log(user);
  if(rooms.has(room)){
    var users = rooms.get(room);
    users[socket.id] = user;
    rooms.set(room,users);
  }
  else{
    var users ={};
    users[socket.id] = user;
    rooms.set(room,users);
  }

  var clients = io.sockets.adapter.rooms.get(room);
  if(clients){
    const clientsArray = Array.from(clients);
    var client = clientsArray[Math.floor(Math.random()*clientsArray.length)];
    io.to(client).emit('clientRequestedData',id);
    console.log(client);
  }
  else {
    doc = await Document.findById(room);
    console.log(doc);
    socket.emit('loadDoc', doc,Object.values(users));
  }

  socket.join(room);

  socket.to(room).emit('connected', user);

  socket.emit('');

  socket.emit('userdata', Object.values(rooms.get(room)));

  socket.on('clientRequestedData', (data)=>{
    io.to(data.id).emit('loadDoc', data);
  })

  socket.on('selection', (data) => {
    data.id = socket.id;
    data.color=color;
    socket.to(room).emit('selection', data) ;
  }) 

  socket.on('textChange', (data)=>{
    socket.to(room).emit('textChange', data);
  })

  socket.on("clientLeft", async (id,room,data) => {
    var users = rooms.get(room);
    delete users[id];
    rooms.set(room,users);
    socket.to(room).emit("exit", id);
    await Document.findByIdAndUpdate(room, { data })
  });
});


app.post('/home',(req,res)=>{
  if(req.isAuthenticated()) return res.json({status: 1, user: req.user});
  else return res.json({status: 0, message:"Unauthorized"});
})

app.use(checkRoom);
app.get('/auth/google', passport.authenticate('google', { scope : ['profile', 'email'] }));

app.get('/auth/google/callback', (req, res, next) => {
	passport.authenticate('google', (error, user, authInfo) => {
		if (!user) res.redirect('http://localhost:3000/error');
		req.logIn(user, (err) => {
			res.redirect('http://localhost:3000/home');
		});
	})(req, res, next)
});

server.listen(5000,()=>{
  console.log('Server Started at port 5000');
});