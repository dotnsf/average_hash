exports.db_username = '';
exports.db_password = '';
exports.db_name = 'ah_db';
exports.db_host = '';
exports.db_url = '';
exports.db_protocol = 'http';
exports.db_port = 5984;
exports.app_port = 0;
exports.image_size = 16;
exports.superSecret = 'ah';
exports.search_analyzer = 'japanese';
exports.search_fields = '[doc.body.user_id]';

if( process.env.VCAP_SERVICES ){
  var VCAP_SERVICES = JSON.parse( process.env.VCAP_SERVICES );
  if( VCAP_SERVICES && VCAP_SERVICES.cloudantNoSQLDB ){
    exports.db_username = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.username;
    exports.db_password = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.password;
    exports.db_host = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.host;
    exports.db_url = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.url;
    exports.db_port = VCAP_SERVICES.cloudantNoSQLDB[0].credentials.port;
    exports.db_protocol = 'https';
  }
}

if( !exports.db_url && exports.db_username && exports.db_password ){
  if( !exports.db_host ){
    exports.db_host = exports.db_username + '.cloudant.com';
    exports.db_port = 443;
    exports.db_protocol = 'https';
  }
  exports.db_url = exports.db_protocol + '://' + exports.db_username + ':' + exports.db_password
      + '@' + exports.db_host;
  if( exports.db_port ){
    exports.db_url += ( ':' + exports.db_port );
  }
}
