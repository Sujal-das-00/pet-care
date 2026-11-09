import { Router } from 'express';
import { z } from 'zod';
import * as pets from '../controllers/petController.js';
import * as weights from '../controllers/weightController.js';
import * as meds from '../controllers/medicationController.js';
import * as vax from '../controllers/vaccinationController.js';
import * as appts from '../controllers/appointmentController.js';
import * as feeding from '../controllers/feedingController.js';
import * as docs from '../controllers/documentController.js';
import { validate } from '../middleware/validate.js';
import { loadOwnedPet } from '../middleware/loaders.js';
import { idParams, pageQuery } from '../validators/common.js';
import * as v from '../validators/pet.js';

const r = Router();

r.get('/', pets.listPets);
r.post('/', validate({ body: v.createPetBody }), pets.createPet);

// Everything below is scoped to a pet the caller owns (404 otherwise).
const scoped = Router({ mergeParams: true });
scoped.use(validate({ params: idParams('petId') }), loadOwnedPet);

scoped.get('/', pets.getPet);
scoped.patch('/', validate({ body: v.updatePetBody }), pets.updatePet);
scoped.delete('/', pets.deletePet);

scoped.get('/weights', validate({ query: pageQuery }), weights.listWeights);
scoped.get('/weights/series', validate({ query: v.seriesQuery }), weights.weightSeries);
scoped.post('/weights', validate({ body: v.weightBody }), weights.addWeight);
scoped.delete('/weights/:weightId', validate({ params: idParams('petId', 'weightId') }), weights.deleteWeight);

const medP = idParams('petId', 'medicationId');
scoped.get('/medications', meds.listMedications);
scoped.post('/medications', validate({ body: v.medicationBody }), meds.createMedication);
scoped.patch('/medications/:medicationId', validate({ params: medP, body: v.updateMedicationBody }), meds.updateMedication);
scoped.post('/medications/:medicationId/finish', validate({ params: medP, body: z.object({ discontinued: z.boolean().default(false) }) }), meds.finishMedication);
scoped.get('/medications/:medicationId/doses', validate({ params: medP, query: pageQuery }), meds.listDoses);
scoped.delete('/medications/:medicationId', validate({ params: medP }), meds.deleteMedication);

const vaxP = idParams('petId', 'vaccinationId');
scoped.get('/vaccinations', vax.listVaccinations);
scoped.post('/vaccinations', validate({ body: v.vaccinationBody }), vax.createVaccination);
scoped.patch('/vaccinations/:vaccinationId', validate({ params: vaxP, body: v.updateVaccinationBody }), vax.updateVaccination);
scoped.delete('/vaccinations/:vaccinationId', validate({ params: vaxP }), vax.deleteVaccination);

const apptP = idParams('petId', 'appointmentId');
scoped.get('/appointments', appts.listAppointments);
scoped.post('/appointments', validate({ body: v.appointmentBody }), appts.createAppointment);
scoped.patch('/appointments/:appointmentId', validate({ params: apptP, body: v.updateAppointmentBody }), appts.updateAppointment);
scoped.delete('/appointments/:appointmentId', validate({ params: apptP }), appts.deleteAppointment);

const feedP = idParams('petId', 'feedingId');
scoped.get('/feeding', feeding.listFeeding);
scoped.post('/feeding', validate({ body: v.feedingBody }), feeding.createFeeding);
scoped.patch('/feeding/:feedingId', validate({ params: feedP, body: v.updateFeedingBody }), feeding.updateFeeding);
scoped.delete('/feeding/:feedingId', validate({ params: feedP }), feeding.deleteFeeding);

const docP = idParams('petId', 'documentId');
scoped.get('/documents', docs.listDocuments);
scoped.post('/documents', validate({ body: v.documentBody }), docs.requestUpload);
scoped.post('/documents/:documentId/confirm', validate({ params: docP }), docs.confirmUpload);
scoped.get('/documents/:documentId/url', validate({ params: docP }), docs.documentUrl);
scoped.delete('/documents/:documentId', validate({ params: docP }), docs.deleteDocument);

r.use('/:petId', scoped);

export default r;
