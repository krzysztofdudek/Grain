package org.springframework.samples.petclinic.owner;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class QuietController {

	private static final Log log = LogFactory.getLog(QuietController.class);

	@GetMapping("/owners/find")
	public String initFindForm() {
		log.debug("rendering the owner search form");
		return "owners/findOwners";
	}

}
