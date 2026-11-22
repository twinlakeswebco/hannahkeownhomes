import propertyTemplate from '../../../property.html';
import { propertyPage } from './router.mjs';

export default {
  fetch(request) {
    return propertyPage(request, propertyTemplate);
  }
};
