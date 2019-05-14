//. import.js
var fs = require( 'fs' );
var Canvas = require( 'canvas' );
var cloudantlib = require( 'cloudant' );
var easyimg = require( 'easyimage' );
var request = require( 'request' );
var settings = require( './settings' );
var Image = Canvas.Image;

var tsvfilename = 'result.tsv';
if( process.argv.length > 2 ){
  tsvfilename = process.argv[2];
}

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

var docs = [];
if( tsvfilename ){
  setTimeout( function(){ myImport(); }, 5000 );
}

function myImport(){
  fs.readFile( tsvfilename, 'utf8', function( err, text ){
    if( err ){
      console.log( err );
    }else{
      var lines = text.split( "\n" );
      console.log( lines.length );

      var cnt = 0;
      lines.forEach( function( line ){
        var tmp = line.split( "\t" );
        if( tmp.length > 11 ){
          cnt ++;
        }
      });

      var c = 0;
      lines.forEach( function( line ){
        var tmp = line.split( "\t" );
        if( tmp.length > 11 ){
          var doc = {
            code: tmp[0],
            area: tmp[1],
            pref: tmp[2],
            pref_ruby: tmp[3],
            county: tmp[4],
            city: tmp[5],
            city_ruby: tmp[6],
            date: tmp[7],
            body: tmp[8],
            //lat: parseFloat( tmp[9] ),
            //lng: parseFloat( tmp[10] ),
            timestamp: ( new Date() ).getTime()
          };
          
          if( tmp[9] ){
            doc.lat = parseFloat( tmp[9] );
          }
          if( tmp[10] ){
            doc.lng = parseFloat( tmp[10] );
          }

          //. 画像取得
          var option = {
            method: 'GET',
            url: 'https:' + tmp[11],
            encoding: null
          };
          request( option, function( err, res, body ){
            if( !err && res.statusCode == 200 ){
              //. 取得した画像を一旦保管
              var filename = 'public/imgs/' + tmp[2] + tmp[4] + tmp[5] + '.png';
              fs.writeFileSync( filename, body, 'binary' );

              var imgtype = 'image/png';

              //. リサイズ（＆グレースケール）
              var dst_filename = filename + '.png';
              var options = {
                src: filename,
                dst: dst_filename,
                ignoreAspectRatio: true,
                background: 'white',
                width: settings.image_size,
                height: settings.image_size
              };

              easyimg.resize( options ).then(
                function( file ){
                  getPixels( dst_filename ).then( function( pixels ){
                    fs.unlink( dst_filename, function(e){} );
                    doc.pixels = pixels;
                    var bin = fs.readFileSync( filename );
                    var bin64 = new Buffer( bin ).toString( 'base64' );
                    doc['_attachments'] = {
                      file: {
                        content_type: 'image/png',
                        data: bin64
                      }
                    };
                    docs.push( doc );

                    c ++;
                    if( docs.length >= 100 ){
                      var _docs = JSON.parse( JSON.stringify( docs ) );
                      docs = [];
                      db.bulk( { docs: _docs }, function( err ){} );
                    }
                    if( c == cnt ){
                      if( docs.length > 0 ){
                        db.bulk( { docs: docs }, function( err ){} );
                      }
                      console.log( 'completed.' );
                    }
                  }, function( err ){
                    //fs.unlink( filename, function(e){} );
                    fs.unlink( dst_filename, function(e){} );

                    c ++;
                    if( c == cnt ){
                      if( docs.length > 0 ){
                        db.bulk( { docs: docs }, function( err ){} );
                      }
                      console.log( 'completed.' );
                    }
                  }, function( err ){
                  });
                }, function( err ){
                  //. for Windows (??)
                  getPixels( dst_filename ).then( function( pixels ){
                    fs.unlink( dst_filename, function(e){} );
                    doc.pixels = pixels;
                    var bin = fs.readFileSync( filename );
                    var bin64 = new Buffer( bin ).toString( 'base64' );
                    doc['_attachments'] = {
                      file: {
                        content_type: imgtype,
                        data: bin64
                      }
                    };
                    docs.push( doc );

                    c ++;
                    if( docs.length >= 100 ){
                      var _docs = JSON.parse( JSON.stringify( docs ) );
                      docs = [];
                      db.bulk( { docs: _docs }, function( err ){} );
                    }
                    if( c == cnt ){
                      if( docs.length > 0 ){
                        db.bulk( { docs: docs }, function( err ){} );
                      }
                      console.log( 'completed.' );
                    }
                  }, function( err ){
                    //fs.unlink( filename, function(e){} );
                    fs.unlink( dst_filename, function(e){} );

                    c ++;
                    if( c == cnt ){
                      if( docs.length > 0 ){
                        db.bulk( { docs: docs }, function( err ){} );
                      }
                      console.log( 'completed.' );
                    }
                  });
                }
              );
            }
          });
        }
      });
    }
  });
}

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
