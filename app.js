//. app.js

var express = require( 'express' ),
    basicAuth = require( 'basic-auth-connect' ),
    Canvas = require( 'canvas' ),
    cfenv = require( 'cfenv' ),
    easyimg = require( 'easyimage' ),
    multer = require( 'multer' ),
    bodyParser = require( 'body-parser' ),
    fs = require( 'fs' ),
    ejs = require( 'ejs' ),
    cloudantlib = require( 'cloudant' ),
    app = express();
var settings = require( './settings' );
var appEnv = cfenv.getAppEnv();
var Image = Canvas.Image;

app.use( multer( { dest: './tmp/' } ).single( 'image' ) );
app.use( bodyParser.urlencoded( { extended: true } ) );
app.use( bodyParser.json() );
app.use( express.Router() );
app.use( express.static( __dirname + '/public' ) );

var db = null;
var cloudant = null;
if( settings.db_username && settings.db_password ){
  var params = { account: settings.db_username, password: settings.db_password };
  cloudant = cloudantlib( params );

  if( cloudant ){
    cloudant.db.get( settings.db_name, function( err, body ){
      if( err ){
        if( err.statusCode == 404 ){
          cloudant.db.create( settings.db_name, function( err, body ){
            if( err ){
              //. 'Error: server_admin access is required for this request' for Cloudant Local
              //. 'Error: insernal_server_error'
              db = null;
            }else{
              db = cloudant.db.use( settings.db_name );
            }
          });
        }else{
          db = null;
        }
      }else{
        db = cloudant.db.use( settings.db_name );
      }
    });
  }
}


app.post( '/search', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var _limit = req.query.limit ? req.query.limit : '';
  var limit = ( _limit ? parseInt( _limit ) : 5 );
  console.log( 'POST /search?limit=' + limit );

  if( db ){
    var imgpath = req.file.path;
    var imgtype = req.file.mimetype;
    var imgname = req.file.originalname; //. "blob"

    //. https://www.npmjs.com/package/easyimage
    var dst_imgpath = imgpath + '.png';
    var options = {
      src: imgpath,
      dst: dst_imgpath,
      ignoreAspectRatio: true,
      background: 'white',
      width: settings.image_size,
      height: settings.image_size
    };

    easyimg.resize( options ).then(
      function( file ){
        getPixels( dst_imgpath ).then( function( pixels ){
          fs.unlink( imgpath, function(e){} );
          fs.unlink( dst_imgpath, function(e){} );

          db.list( { include_docs: true }, function( err, body ){
            if( err ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
              res.end();
            }else{
              var docs = [];
              body.rows.forEach( function( doc ){
                var _doc = JSON.parse(JSON.stringify(doc.doc));
                if( _doc._id.indexOf( '_' ) !== 0 ){
                  var point = 0;
                  for( var y = 0; y < pixels.length; y ++ ){
                    for( var x = 0; x < pixels[y].length; x ++ ){
                      if( pixels[y][x] == _doc.pixels[y][x] ){
                        point ++;
                      }
                    }
                  }

                  _doc.point = point;
                  docs.push( _doc );
                }
              });

              docs.sort( compareByPointRev );
              //if( limit ){ docs.slice( limit ); }

              res.write( JSON.stringify( { status: true, pixels: pixels, docs: docs.slice( 0, limit ) }, 2, null ) );
              res.end();
            }
          });
        }, function( err ){
          fs.unlink( imgpath, function(e){} );
          fs.unlink( dst_imgpath, function(e){} );
          res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
          res.end();
        });
      }, function( err ){
        //. for Windows (??)
        getPixels( dst_imgpath ).then( function( pixels ){
          fs.unlink( imgpath, function(e){} );
          fs.unlink( dst_imgpath, function(e){} );

          db.list( { include_docs: true }, function( err, body ){
            if( err ){
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
              res.end();
            }else{
              var docs = [];
              body.rows.forEach( function( doc ){
                var _doc = JSON.parse(JSON.stringify(doc.doc));
                if( _doc._id.indexOf( '_' ) !== 0 ){
                  var point = 0;
                  for( var y = 0; y < pixels.length; y ++ ){
                    for( var x = 0; x < pixels[y].length; x ++ ){
                      if( pixels[y][x] == _doc.pixels[y][x] ){
                        point ++;
                      }
                    }
                  }

                  _doc.point = point;
                  docs.push( _doc );
                }
              });

              docs.sort( compareByPointRev );
              //if( limit ){ docs.slice( limit ); }

              res.write( JSON.stringify( { status: true, pixels: pixels, docs: docs.slice( 0, limit ) }, 2, null ) );
              res.end();
            }
          });
        }, function( err ){
          fs.unlink( imgpath, function(e){} );
          fs.unlink( dst_imgpath, function(e){} );
          res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
          res.end();
        });
      }
    );
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.post( '/image', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /image' );

  if( db ){
    var imgpath = req.file.path;
    var imgtype = req.file.mimetype;
    var imgname = req.file.originalname;

    //. https://www.npmjs.com/package/easyimage
    var dst_imgpath = imgpath + '.png';
    var options = {
      src: imgpath,
      dst: dst_imgpath,
      background: 'white',
      ignoreAspectRatio: true,
      width: settings.image_size,
      height: settings.image_size
    };

    easyimg.resize( options ).then(
      function( file ){
        getPixels( dst_imgpath ).then( function( pixels ){
          var doc = req.body;
          doc.timestamp = ( new Date() ).getTime();
          doc.filename = imgname;
          doc.pixels = pixels;
          var bin = fs.readFileSync( imgpath );
          var bin64 = new Buffer( bin ).toString( 'base64' );
          doc['_attachments'] = {
            file: {
              content_type: imgtype,
              data: bin64
            }
          };

          db.insert( doc, function( err, body ){
            fs.unlink( imgpath, function(e){} );
            fs.unlink( dst_imgpath, function(e){} );
            if( err ){
              console.log( err );
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
              res.end();
            }else{
              //console.log( body );
              res.write( JSON.stringify( { status: true, pixels: pixels }, 2, null ) );
              res.end();
            }
          });
        }, function( err ){
          fs.unlink( imgpath, function(e){} );
          fs.unlink( dst_imgpath, function(e){} );
          res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
          res.end();
        });
      }, function( err ){
        //. for Windows (??)
        getPixels( dst_imgpath ).then( function( pixels ){
          var doc = req.body;
          doc.timestamp = ( new Date() ).getTime();
          doc.filename = imgname;
          doc.pixels = pixels;
          var bin = fs.readFileSync( imgpath );
          var bin64 = new Buffer( bin ).toString( 'base64' );
          doc['_attachments'] = {
            file: {
              content_type: imgtype,
              data: bin64
            }
          };

          db.insert( doc, function( err, body ){
            fs.unlink( imgpath, function(e){} );
            fs.unlink( dst_imgpath, function(e){} );
            if( err ){
              console.log( err );
              res.status( 400 );
              res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
              res.end();
            }else{
              //console.log( body );
              res.write( JSON.stringify( { status: true, pixels: pixels }, 2, null ) );
              res.end();
            }
          });
        }, function( err ){
          fs.unlink( imgpath, function(e){} );
          fs.unlink( dst_imgpath, function(e){} );
          res.write( JSON.stringify( { status: false, error: err }, 2, null ) );
          res.end();
        });
      }
    );
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/image/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'GET /image/' + id );
  var include_pixels = ( req.query.include_pixels ? true : false );

  if( db ){
    db.get( id, { include_docs: true }, function( err, doc ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        if( !include_pixels ){
          delete doc['pixels'];
        }
        res.write( JSON.stringify( { status: true, doc: doc }, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/attachment/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  var key = req.query.key ? req.query.key : '';  //. 'file' or 'dst_file'
  if( key != 'file' && key != 'dst_file' ){ key = 'file'; }
  console.log( 'GET /attachment/' + id + '?key=' + key );

  if( db ){
    db.get( id, { include_docs: true }, function( err, doc ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        if( doc._attachments ){
          if( key in doc._attachments ){
            var attachment = doc._attachments[key];
            if( attachment.content_type ){
              res.contentType( attachment.content_type );
            }

            //. 添付画像バイナリを取得する
            db.attachment.get( id, key, function( err, buf ){
              if( err ){
                res.contentType( 'application/json; charset=utf-8' );
                res.status( 400 );
                res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
                res.end();
              }else{
                res.end( buf, 'binary' );
              }
            });
          }else{
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: 'attachment image not found.' }, 2, null ) );
            res.end();
          }
        }
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.get( '/images', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  //var type = req.query.type;
  var limit = req.query.limit ? parseInt( req.query.limit ) : 0;
  var offset = req.query.offset ? parseInt( req.query.offset ) : 0;
  console.log( 'GET /images?limit=' + limit + '&offset=' + offset );

  if( db ){
    db.list( { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        var docs = [];
        body.rows.forEach( function( doc ){
          var _doc = JSON.parse(JSON.stringify(doc.doc));
          if( _doc._id.indexOf( '_' ) !== 0 ){
            docs.push( _doc );
          }
        });

        docs.sort( compareByTimestampRev ); //. 時系列逆順ソート

        if( offset || limit ){
          docs = docs.slice( offset, offset + limit );
        }

        var result = { status: true, docs: docs };
        res.write( JSON.stringify( result, 2, null ) );
        res.end();
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.delete( '/image/:id', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  var id = req.params.id;
  console.log( 'DELETE /image/' + id );

  if( db ){
    db.get( id, function( err, doc ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        db.destroy( id, doc._rev, function( err, body ){
          if( err ){
            res.status( 400 );
            res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
            res.end();
          }else{
            res.write( JSON.stringify( { status: true }, 2, null ) );
            res.end();
          }
        });
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});

app.post( '/reset', function( req, res ){
  res.contentType( 'application/json; charset=utf-8' );
  console.log( 'POST /reset' );

  if( db ){
    db.list( { include_docs: true }, function( err, body ){
      if( err ){
        res.status( 400 );
        res.write( JSON.stringify( { status: false, message: err }, 2, null ) );
        res.end();
      }else{
        var docs = [];
        body.rows.forEach( function( doc ){
          var _doc = JSON.parse(JSON.stringify(doc.doc));
          if( _doc.pixels && _doc.pixels.length ){
            docs.push( { _id: _doc._id, _rev: _doc._rev, _deleted: true } );
          }
        });

        if( docs.length > 0 ){
          db.bulk( { docs: docs }, function( err ){
            res.write( JSON.stringify( { status: true, message: docs.length + ' images are deleted.' }, 2, null ) );
            res.end();
          });
        }else{
          res.write( JSON.stringify( { status: true, message: 'No images need to be deleted.' }, 2, null ) );
          res.end();
        }
      }
    });
  }else{
    res.status( 400 );
    res.write( JSON.stringify( { status: false, message: 'db is failed to initialize.' }, 2, null ) );
    res.end();
  }
});


function getPixels( filepath ){
  return new Promise( function( resolve, reject ){
    fs.readFile( filepath, function( err, data ){
      if( err ){
        reject( err );
      }else{
        var pixels = [];
        var img = new Image();
        img.src = data;
        var canvas = new Canvas( settings.image_size, settings.image_size );
        var ctx = canvas.getContext( '2d' );
        ctx.drawImage( img, 0, 0, img.width, img.height );

        var imagedata = ctx.getImageData( 0, 0, img.width, img.height );

        var avg = 0.0;
        for( var y = 0; y < imagedata.height; y ++ ){
          for( var x = 0; x < imagedata.width; x ++ ){
            var idx = ( y * imagedata.width + x ) * 4;
            var R = imagedata.data[idx];
            var G = imagedata.data[idx+1];
            var B = imagedata.data[idx+2];
            //var A = imagedata.data[idx+3];
            avg += ( R + G + B );
          }
        }
        avg /= imagedata.height * imagedata.width;

        for( var y = 0; y < imagedata.height; y ++ ){
          var line = [];
          for( var x = 0; x < imagedata.width; x ++ ){
            var idx = ( y * imagedata.width + x ) * 4;
            var R = imagedata.data[idx];
            var G = imagedata.data[idx+1];
            var B = imagedata.data[idx+2];
            //var A = imagedata.data[idx+3];
            var z = ( R + G + B );
            var pixel = ( avg > z ? 0 : 1 );  //. 白が１

            line.push( pixel );
          }
          pixels.push( line );
        }
        resolve( pixels );
      }
    });
  });
}

function countScore( pixels1, pixels2, grayscale ){
  return new Promise( function( resolve, reject ){
    var score = 0;
    if( grayscale ){
      for( var i = 0; i < pixels1.length; i ++ ){
        var v1 = Math.floor( ( pixels1[i][0] + pixels1[i][1] + pixels1[i][2] ) / 3 );
        pixels1[i][0] = pixels1[i][1] = pixels1[i][2] = v1;
        var v2 = Math.floor( ( pixels2[i][0] + pixels2[i][1] + pixels2[i][2] ) / 3 );
        pixels2[i][0] = pixels2[i][1] = pixels2[i][2] = v2;
      }
    }
    for( var i = 0; i < pixels1.length; i ++ ){
      for( var j = 0; j < pixels1[i].length; j ++ ){
        var s = ( pixels1[i][j] - pixels2[i][j] ) * ( pixels1[i][j] - pixels2[i][j] );
        score += s;
      }
    }

    resolve( score );
  });
}

function compareByTimestamp( a, b ){
  var r = 0;
  if( a.timestamp < b.timestamp ){ r = -1; }
  else if( a.timestamp > b.timestamp ){ r = 1; }

  return r;
}

function compareByTimestampRev( a, b ){
  var r = 0;
  if( a.timestamp < b.timestamp ){ r = 1; }
  else if( a.timestamp > b.timestamp ){ r = -1; }

  return r;
}

function compareByScore( a, b ){
  var r = 0;
  if( a.score < b.score ){ r = -1; }
  else if( a.score > b.score ){ r = 1; }

  return r;
}

function timestamp2datetime( ts ){
  var dt = new Date( ts );
  var yyyy = dt.getFullYear();
  var mm = dt.getMonth() + 1;
  var dd = dt.getDate();
  var hh = dt.getHours();
  var nn = dt.getMinutes();
  var ss = dt.getSeconds();
  var datetime = yyyy + '-' + ( mm < 10 ? '0' : '' ) + mm + '-' + ( dd < 10 ? '0' : '' ) + dd
    + ' ' + ( hh < 10 ? '0' : '' ) + hh + ':' + ( nn < 10 ? '0' : '' ) + nn + ':' + ( ss < 10 ? '0' : '' ) + ss;
  return datetime;
}

function compareByPointRev( a, b ){
  var r = 0;
  if( a.point < b.point ){ r = 1; }
  else if( a.point > b.point ){ r = -1; }

  return r;
}



app.listen( appEnv.port );
console.log( "server stating on " + appEnv.port + " ..." );
