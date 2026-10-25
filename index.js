// App entry point.
// Registers the background-geolocation headless task (Android, app closed)
// before handing over to expo-router.
import 'expo-router/entry';
import { registerHeadlessTask } from './services/autoAttendance.service';

registerHeadlessTask();
