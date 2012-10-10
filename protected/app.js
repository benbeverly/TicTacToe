var app = require("http").createServer(appHandler),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
    io = require("socket.io").listen(app),
    ttboard = require("./TicTacBoard");

app.listen(80);

var pendingGames = Array();
var inProgressGames = new Object;
var peopleConnected = 0;
Array.prototype.doesGameExist = function(gameId) {
	for(var i in this) {
		game = this[i];
		if(game.id != 'undefined' && game.id == gameId) {
			return i;
		}
	}
	return false;
}
function appHandler(request, response) {
    var uri = url.parse(request.url).pathname;
    if (uri == 'undefined' || uri == null || uri == '/') {
    	uri = 'index.html';
    }
    var filename = path.join(process.cwd(), 'public/' + uri);
    
    fs.exists(filename, function(exists) {
        if(!exists) {
            response.writeHead(404, {"Content-Type": "text/plain"});
            response.end("404 Not Found");
            return;
        }
        
        fs.readFile(filename, "binary", function(err, file) {
            if(err) {
                response.writeHead(500, {"Content-Type": "text/plain"});
                response.end(err + "n");
                return;
            }
        	
            var contentType;
        	extension = path.extname(filename);        	
        	if(extension == '.html' || extension == '.htm') {
        		contentType = { 'Content-Type' : 'text/html' };
        	} else if(extension == '.js') {
        		contentType = { 'Content-Type' : 'text/javascript' };
        	} else if(extension == '.css') {
        		contentType = { 'Content-Type' : 'text/css' };
        	}
            response.writeHead(200, contentType );
            response.end(file, "binary");
        });
    });
};

io.sockets.on('connection', function(socket) {
	peopleConnected++;
	broadcastPeopleConnected
	if(pendingGames.length == 0) {
		newGame = ttboard.create(new Date().getTime(), socket.id);
		socket.gameid = newGame.id;
		pendingGames.push(newGame);
	} else {
		matchedGame = pendingGames.pop();
		socket.gameid = matchedGame.id;
		
		matchedGame.setPlayer2(socket.id);
		inProgressGames[matchedGame.id] = matchedGame;
		
		socket.emit('matchfound', { 
			gameid: matchedGame.id,  
			thisplayer: 'X',
			thatplayer: 'O',
			first: false,	
		});
		
		io.sockets.socket(matchedGame.player1).emit('matchfound', {
			gameid: matchedGame.id, 
			playerid: matchedGame.player1, 
			thisplayer: 'O',
			thatplayer: 'X',
			first: true,
		});
		
	}

	socket.on('moveplayed', function (data) {					
		var thisGame = inProgressGames[socket.gameid];		
		var thisPlayer = socket.id;
		var quadrant = data.quadrant;
		
		thisGame.performMove(thisPlayer, quadrant);
		
		if(thisGame.isWinner(thisPlayer)) {
			endGame(thisGame, thisPlayer);
		} else if(thisGame.isTie()) {
			endGame(thisGame);
		} else {
			sendMovePlayedMessage(thisGame, thisPlayer, quadrant);
		}
	});
	
	socket.on('disconnect', function() {	
		peopleConnected--;
		broadcastPeopleConnected
		if(socket.gameid == 'undefined') {			
			return;
		}
		
		if(inProgressGames.hasOwnProperty(socket.gameid)) {			
			var thisGame = inProgressGames[socket.gameid];
			var thatPlayer = determineThatPlayer(thisGame, socket.id);
			delete inProgressGames[socket.gameid];
			delete io.sockets.socket(thatPlayer).gameid;
			io.sockets.socket(thatPlayer).emit('disco', { message: 'You Win! Opponent resigned.' });
		} else {	
			pendingGameIndex = pendingGames.doesGameExist(socket.gameid);
			console.log(pendingGameIndex);
			if(pendingGameIndex != false || pendingGameIndex != 'undefined') {
				pendingGames.splice(pendingGameIndex, 1);
			}
			console.log(pendingGames.toString());
		}
		
		
	});
});

function broadcastPeopleConnected() {
	io.sockets.emit('peopleconnected', { message: 'There are ' + peopleConnected + 'connected.' })
}

function endGame(thisGame, winner) {
	
	if(winner == 'undefined') {
		sendTieMessage(thisGame);
	} else {
		var loser = determineThatPlayer(thisGame, winner);
		sendWinLoseMessage(winner, loser);
	}
	
	delete io.sockets.socket(thisGame.player1).gameid;
	delete io.sockets.socket(thisGame.player2).gameid;
	delete inProgressGames[thisGame.gameid];
}

function sendMovePlayedMessage(thisGame, thisPlayer, quadrant) {
	var thatPlayer = determineThatPlayer(thisGame, thisPlayer);			
	io.sockets.socket(thatPlayer).emit('moveplayed', { quadrant: quadrant });
}

function sendWinLoseMessage(winner, loser) {
	io.sockets.socket(winner).emit('win', { message: 'Congratulations! You Win!' });
	io.sockets.socket(loser).emit('lose', { message: 'You Lose!' });
}

function sendTieMessage(thisGame) {
	io.sockets.socket(thisGame.player1).emit('tie', { message: "It's a tie!" });
	io.sockets.socket(thisGame.player2).emit('tie', { message: "It's a tie!" });
}

function determineThatPlayer(thisGame, thisPlayer) {
	if(thisPlayer == thisGame.player1) {
		return thisGame.player2;
	} else {
		return thisGame.player1;
	}
}
