#!/usr/bin/env node
var net = require('net');
var util = require('util');
var events = require("events");

var _ = require('underscore');


var TTYServer = function(){
  var self = this;

  self.rooms = {};
  self.number = 1;
  self.conns = {};

  self.server = net.createServer(function(conn){
    var number = self.number++,

    ptyconn = new PTYConn(self, number, conn);

    ptyconn.on('list', function(event){
      conn.write(JSON.stringify(self.conns));
    });

    ptyconn.on('create_pty', self.create_pty.bind(self, ptyconn));

    ptyconn.on('stdout', self.broadcast.bind(self));
    ptyconn.on('stdin', self.send_stdin.bind(self));
    self.conns[number] = ptyconn;

  });
  events.EventEmitter.call(self);
};

util.inherits(TTYServer, events.EventEmitter);

TTYServer.prototype.send_stdin = function(sender, data) {
  var self = this;

  console.log('sending stdin', data);
  self.pty.owner.conn.write(data);
};

TTYServer.prototype.listen = function(){
  var self = this;

  self.server.listen(5678, function() {
    console.log('server bound');
  });
};

TTYServer.prototype.broadcast = function(sender, stdout){
  var self = this;

  if (sender !== self.pty.owner) {
    console.log('this dude is not the owner!');
    return;
  }

  _.each(self.conns, function(conn, number){
    if (number == sender.id){
      return;
    }
    console.log('sending stdout');
    conn.send(stdout);
  });
  console.log('got stdout', stdout);
};

TTYServer.prototype.create_pty = function(sender,  event){
  var self = this;

  if (self.pty) {
    console.log("OMG ONLY ONE PTY ALLOWED");
    return;
  }
  self.pty = new PTY(event.name, sender);
};


var PTYConn = function(server, id, conn){
  var self = this;

  events.EventEmitter.call(this);

  self.server = server;
  self.id = id;
  self.conn = conn;
  self.buf = "";

  self.conn.on('data', self.on_data.bind(self));
  self.conn.on('end', self.on_end.bind(self, server));
};

util.inherits(PTYConn, events.EventEmitter);

PTYConn.prototype.on_data = function (d) {
  var self = this;
  var msg;
  var auth_data;
  var newline_index;

  self.buf += d;

  newline_index = self.buf.indexOf('\n');
  while (newline_index !== -1) {
    msg = self.buf.slice(0, newline_index);
    self.buf = self.buf.slice(newline_index+1);
    self.handle_msg(msg);
    newline_index = self.buf.indexOf('\n');
  }
};

PTYConn.prototype.send = function (d) {
  var self = this;

  self.conn.write(d);
};

PTYConn.prototype.on_end = function (server) {
  var self = this;

  console.log('gone');
  self.removeAllListeners();
  delete server.conns[self.id];
};

PTYConn.prototype.handle_msg = function (msg){
  var self = this;

  try {
    msg = JSON.parse(msg);
  } catch (e) {
    log.error("couldn't parse json:", msg, "error:", e);
    return self.disconnect();
  }
  return self.emit(msg.name, self, msg.data);
};


PTY = function(name, owner){
  var self = this;

  self.name = name;
  self.owner = owner;

  events.EventEmitter.call(self);
};

util.inherits(PTY, events.EventEmitter);



var ttyserver = new TTYServer();
ttyserver.listen();