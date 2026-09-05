package org.springframework.samples.petclinic.owner;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
class NoisyController {

	@GetMapping("/owners/find")
	public String initFindForm() {
		System.out.println("rendering the owner search form");
		return "owners/findOwners";
	}

}
