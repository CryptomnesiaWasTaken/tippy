const Router = require('express').Router
const mongodb = require('mongodb');
const crypto = require('./lib/crypto');

module.exports = (db) => {
  const api = Router();

  api.get('/', (_req, res) => {
  	res.render('home', {
        deleteStaleMessages: process.env.DELETE_STALE_MESSSAGES == 'true' ? true : false,
        deleteStaleMessagesDays: +process.env.DELETE_STALE_MESSAGES_DAYS,
    });
  });

  api.post('/api/create', async (req, res) => {
    try {
      const { iv, securityKey, ttl, note } = req.body;
      if (!securityKey) {
        securityKey = crypto.generateIVAndSecurityKey().securityKey;
      }
      if (!iv) {
        iv = crypto.generateIVAndSecurityKey().iv;
      }
      const encryptedNote = crypto.encrypt(note, iv, securityKey);
      const url = (process.env.PUBLIC_URL || '') + `/api/read/${securityKey}/${iv}`;
      const timestamp = new Date().getTime();
      await db.collection('tippys').insertOne({note: encryptedNote, securityKey, ttl, timestamp});
      res.json({url});
    } catch (error) {
      console.error(error);
      res.json({error: 'Error creating tippy, please try again later.'});
    }
  });

  api.get('/api/read/:securityKey/:iv', async (req, res) => {
    const { securityKey, iv } = req.params;
    try {
      const encryptedNote = await db.collection('tippys').findOne({securityKey});
      try {
        const decryptedNote = crypto.decrypt(encryptedNote.note, iv, securityKey);
        const ascii = crypto.isASCII(iv + securityKey);
        await db.collection('tippys').deleteOne({securityKey});
        if (ascii) {
          res.json({note: decryptedNote, error: 'Tippy has been destroyed.'});
        } else {
          res.json({note: null, error: 'Incorrect URL parameters. Tippy has been destroyed.'})
        }
      } catch (error) {
        console.error(error);
        await db.collection('tippys').deleteOne({securityKey});
        res.json({note: null, error: 'Incorrect key. Tippy has been destroyed.'})
      }
      
    } catch (error) {
      console.error(error);
      res.json({note: null, error: 'Could not find tippy, maybe it was deleted.'});
    }
    
  });

  api.post('/create', async (req, res) => {
    try {
      const { note, ttl, securityKey } = req.body;
      const timestamp = new Date().getTime();
      await db.collection('tippys').insertOne({note, securityKey, ttl, timestamp});
      res.json();
    } catch (error) {
      console.error(error);
      res.json({error: 'Error creating tippy, please try again later.'});
    }
  });

  api.get('/read/:securityKey/:iv', async (req, res) => {
    const { securityKey, iv } = req.params;
    try {
      const encryptedNote = await db.collection('tippys').findOne({securityKey});
      if (!encryptedNote) {
        res.render('read', {note: null, error: 'Could not find tippy, maybe it got deleted.'});
      } else {
        if (encryptedNote.ttl == 0) { // non-timed ttl
          try {
            crypto.decrypt(encryptedNote.note, iv, securityKey);
            const destroyUrl = `/read/${securityKey}/${iv}/destroy`;
            res.render('areyousure', {destroyUrl});
          } catch (error) {
            console.error(error);
            await db.collection('tippys').deleteOne({securityKey});
            res.render('read', {note: null, error: 'Incorrect key. Tippy has been destroyed.'})
          }
        } else { // timed note
          const currentTimestamp = new Date().getTime();
          if (currentTimestamp >= ((encryptedNote.ttl * 1000) + encryptedNote.timestamp)) { // Expired
            await db.collection('tippys').deleteOne({securityKey});
            res.render('read', {note: null, error: 'This tippy has expired.'});
          } else {
            try {
              // check to see if note can even be decrypted, but don't send back
              res.render('read', {note: encryptedNote.note});
            } catch (error) {
              console.error(error);
              await db.collection('tippys').deleteOne({securityKey});
              res.render('read', {note: null, error: 'Incorrect key. Tippy has been destroyed.'})
            }
          }
        }
      }
      
    } catch (error) {
      console.error(error);
      res.render('read', {error: 'An error occurred when retrieving tippy'});
    }
  });

  api.get('/read/:securityKey/:iv/destroy', async (req, res) => {
    const { securityKey, iv } = req.params;
    try {
      const encryptedNote = await db.collection('tippys').findOne({securityKey});
      if (!encryptedNote) {
        res.render('read', {note: null, error: 'Could not find tippy, maybe it got deleted.'});
      } else {
        try {
          const ascii = crypto.isASCII(securityKey + iv);
          await db.collection('tippys').deleteOne({securityKey});
          if (ascii) {
            res.render('read', {note: encryptedNote.note, error: 'Tippy has been destroyed.'});
          } else {
            res.render('read', {note: null, error: 'Incorrect URL parameters. Note has been destroyed.'})
          }
        } catch (error) {
          console.error(error);
          await db.collection('tippys').deleteOne({securityKey});
          res.render('read', {note: null, error: 'Incorrect key. Tippy has been destroyed.'})
        }
        
      }
    } catch (error) {
      console.error(error);
      res.render('read', {error: 'An error occurred when retrieving tippy'});
    }
  });

  return api;
}
