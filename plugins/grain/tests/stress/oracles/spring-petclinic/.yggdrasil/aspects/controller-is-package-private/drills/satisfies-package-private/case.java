package org.springframework.samples.petclinic.owner;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class QuietOwnerController {

	@GetMapping("/owners/find")
	public String initFindForm() {
		return "owners/findOwners";
	}

}
